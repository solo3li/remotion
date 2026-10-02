// AgentPulse 桌面壳。
//
// 它只做三件事：起后端、开窗口、退出时把后端干净关掉。界面全在 apps/app，
// 后端自己同源伺服它（/app），所以这里没有 proxy、没有 CORS、没有 preload 桥。
//
// 安全（ADR 0005）：后端子进程的 cwd **显式锚定**在应用自己的资源目录，
// 绝不继承 Finder 给的随机 cwd —— 那条路走过一次，agent 把测试文件写进了
// 另一个项目的主仓库。

const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const PORT = Number(process.env.AGENTPULSE_PORT || 8787);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DEV = !app.isPackaged;

let api = null;
let win = null;

/** 打包后所有随包资源都在这下面；开发时指回仓库。 */
function resources() {
  return DEV ? path.join(__dirname, "..", "..") : process.resourcesPath;
}

/** 后端的 Python。打包时用随包 venv，开发时可用 AGENTPULSE_PYTHON 指定。 */
function pythonPath() {
  if (process.env.AGENTPULSE_PYTHON) return process.env.AGENTPULSE_PYTHON;
  const bundled = path.join(resources(), "runtime", "bin", "python3");
  return fs.existsSync(bundled) ? bundled : "python3";
}

function apiRoot() {
  return DEV
    ? path.join(resources(), "services", "api")
    : path.join(resources(), "api");
}

function startApi() {
  const cwd = apiRoot();
  const web = path.join(resources(), DEV ? "apps/app/dist" : "web");

  api = spawn(pythonPath(), ["-m", "uvicorn", "app.main:app",
                             // 0.0.0.0 是为了手机能从局域网连进来（ADR 0021 三端同源）
                             "--host", "0.0.0.0", "--port", String(PORT)], {
    cwd,                      // 显式绝对路径，不继承 Finder 的 cwd（ADR 0005）
    env: {
      ...process.env,
      PYTHONPATH: cwd,
      PYTHONUNBUFFERED: "1",
      AGENTPULSE_PORT: String(PORT),
      AGENTPULSE_WEB_ROOT: fs.existsSync(web) ? web : "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    // 自成进程组，退出时能把 dsh 子进程一起收掉
    detached: true,
  });

  // 后端日志留在应用日志目录 —— 出问题时老板能捞到东西给我们看
  const logFile = path.join(app.getPath("logs"), "api.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.createWriteStream(logFile, { flags: "a" });
  api.stdout.pipe(log);
  api.stderr.pipe(log);

  api.on("exit", (code, signal) => {
    api = null;
    // 我们主动关的（quitting）不算崩
    if (!app.isQuiting && code !== 0 && signal !== "SIGTERM") {
      dialog.showErrorBox(
        "后端退出了",
        `AgentPulse 的后端进程停了（code ${code}）。\n\n` +
        `日志在：${logFile}`,
      );
    }
  });
}

/** 等 /health 起来。后端要装载 dsh 运行时，第一次会慢一点。 */
function waitForApi(timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`${ORIGIN}/health`, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve() : retry();
      });
      req.on("error", retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error("后端没起来"));
      setTimeout(probe, 400);
    };
    probe();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 420,          // 手机版布局的断点是 760px，窄窗口要能用
    minHeight: 480,
    title: "AgentPulse",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      // 界面只用 fetch/EventSource 和后端说话，不需要 Node 也不需要 preload
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // 外部链接交给系统浏览器，不在应用里开
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  return win.loadURL(DEV ? "http://localhost:5173" : `${ORIGIN}/app/`);
}

app.whenReady().then(async () => {
  if (!DEV) {
    startApi();
    try {
      await waitForApi();
    } catch (err) {
      dialog.showErrorBox("起不来", `后端没能启动：${err.message}\n\n` +
        `日志在：${path.join(app.getPath("logs"), "api.log")}`);
      app.quit();
      return;
    }
  }
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (!api) return;
  app.isQuiting = true;

  // 先 SIGTERM：API 的 lifespan 会唤醒所有桥等待者、取消在飞的讨论。
  // 但一个卡住的 dsh 子进程可能拖着后端不放（员工那轮跑在不可取消的线程里），
  // 所以必须有兜底强杀 —— **后端出问题绝不能让 app 关不掉**。
  event.preventDefault();
  const child = api;
  const done = () => { api = null; app.quit(); };

  const hard = setTimeout(() => {
    // 连它 spawn 出来的 dsh 一起收掉：kill 负 pid 打整个进程组
    try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    done();
  }, 6000);

  child.once("exit", () => { clearTimeout(hard); done(); });
  child.kill("SIGTERM");
});
