// Dynamic Parameter Service - Manages runtime parameter option updates
import { INodePropertyOption } from '../types/INodeProperties';

interface DynamicParameterOptions {
  [nodeId: string]: {
    [parameterName: string]: INodePropertyOption[];
  };
}

class DynamicParameterService {
  private static dynamicOptions: DynamicParameterOptions = {};
  private static listeners: ((nodeId: string, parameterName: string, options: INodePropertyOption[]) => void)[] = [];

  // Subscribe to dynamic option updates
  static subscribe(callback: (nodeId: string, parameterName: string, options: INodePropertyOption[]) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Update options for a specific parameter
  static updateParameterOptions(nodeId: string, parameterName: string, options: INodePropertyOption[]) {
    if (!this.dynamicOptions[nodeId]) {
      this.dynamicOptions[nodeId] = {};
    }

    this.dynamicOptions[nodeId][parameterName] = options;

    // Notify all listeners
    this.listeners.forEach((listener) => {
      listener(nodeId, parameterName, options);
    });
  }

  // Get options for a specific parameter
  static getParameterOptions(nodeId: string, parameterName: string): INodePropertyOption[] | null {
    return this.dynamicOptions[nodeId]?.[parameterName] || null;
  }

  // Clear options for a specific parameter
  static clearParameterOptions(nodeId: string, parameterName: string) {
    if (this.dynamicOptions[nodeId]) {
      delete this.dynamicOptions[nodeId][parameterName];

      // Notify listeners with empty array
      this.listeners.forEach(listener => {
        listener(nodeId, parameterName, []);
      });
    }
  }

  // Clear all options for a node
  static clearNodeOptions(nodeId: string) {
    if (this.dynamicOptions[nodeId]) {
      const parameterNames = Object.keys(this.dynamicOptions[nodeId]);
      delete this.dynamicOptions[nodeId];

      // Notify listeners for each parameter
      parameterNames.forEach(parameterName => {
        this.listeners.forEach(listener => {
          listener(nodeId, parameterName, []);
        });
      });
    }
  }

  // Convert model strings to INodePropertyOption format
  static createModelOptions(models: string[]): INodePropertyOption[] {
    return models.map(model => ({
      name: this.formatModelName(model),
      value: model,
      label: this.formatModelName(model),
      description: `Model: ${model}`
    }));
  }

  // Format model name for display
  private static formatModelName(modelId: string): string {
    // Preserve [FREE] prefix if present
    const hasFreePrefix = modelId.startsWith('[FREE] ');
    const cleanId = hasFreePrefix ? modelId.slice(7) : modelId;

    const formatted = cleanId
      .replace(/^gpt-/, 'GPT-')
      .replace(/^claude-/, 'Claude ')
      .replace(/^gemini-/, 'Gemini ')
      .replace(/turbo/i, 'Turbo')
      .replace(/^o1-/, 'O1-');

    // Return with [FREE] prefix preserved if it was there
    return hasFreePrefix ? `[FREE] ${formatted}` : formatted;
  }
}

export default DynamicParameterService;