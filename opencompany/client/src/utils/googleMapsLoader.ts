// Google Maps API Loader - Singleton pattern to prevent multiple script loads
// Ensures Google Maps JavaScript API is loaded only once per page

interface GoogleMapsLoaderOptions {
  apiKey: string;
  libraries?: string[];
  version?: string;
}

class GoogleMapsLoader {
  private static instance: GoogleMapsLoader;
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;
  private isLoading = false;

  private constructor() {}

  public static getInstance(): GoogleMapsLoader {
    if (!GoogleMapsLoader.instance) {
      GoogleMapsLoader.instance = new GoogleMapsLoader();
    }
    return GoogleMapsLoader.instance;
  }

  public async loadGoogleMaps(options: GoogleMapsLoaderOptions): Promise<void> {
    // If already loaded, resolve immediately
    if (this.isLoaded) {
      return Promise.resolve();
    }

    // If currently loading, return the existing promise
    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    // Check if Google Maps is already available (loaded externally)
    if (typeof window !== 'undefined' && window.google?.maps) {
      this.isLoaded = true;
      return Promise.resolve();
    }

    // Start loading
    this.isLoading = true;
    this.loadPromise = this.createLoadPromise(options);

    try {
      await this.loadPromise;
      this.isLoaded = true;
      this.isLoading = false;
    } catch (error) {
      this.isLoading = false;
      this.loadPromise = null;
      throw error;
    }
  }

  private createLoadPromise(options: GoogleMapsLoaderOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        // Script exists, wait for it to load
        if (window.google?.maps) {
          resolve();
        } else {
          existingScript.addEventListener('load', () => resolve());
          existingScript.addEventListener('error', (error) => reject(error));
        }
        return;
      }

      // Create new script element
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.defer = true;

      // Build URL with parameters
      const { apiKey, libraries = ['geometry'], version = 'weekly' } = options;
      const params = new URLSearchParams({
        key: apiKey,
        libraries: libraries.join(','),
        v: version,
        callback: '__googleMapsCallback__'
      });

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

      // Set up callback
      (window as any).__googleMapsCallback__ = () => {
        delete (window as any).__googleMapsCallback__;
        resolve();
      };

      // Handle errors
      script.onerror = (error) => {
        delete (window as any).__googleMapsCallback__;
        reject(new Error(`Failed to load Google Maps API: ${error}`));
      };

      // Add script to document
      document.head.appendChild(script);
    });
  }

  public isGoogleMapsLoaded(): boolean {
    return this.isLoaded || (typeof window !== 'undefined' && !!window.google?.maps);
  }

  public getGoogleMaps(): typeof google.maps | null {
    if (typeof window !== 'undefined' && window.google?.maps) {
      return window.google.maps;
    }
    return null;
  }
}

// Export singleton instance and convenience functions
export const googleMapsLoader = GoogleMapsLoader.getInstance();

export const loadGoogleMaps = (options: GoogleMapsLoaderOptions): Promise<void> => {
  return googleMapsLoader.loadGoogleMaps(options);
};

export const isGoogleMapsLoaded = (): boolean => {
  return googleMapsLoader.isGoogleMapsLoaded();
};

export const getGoogleMaps = (): typeof google.maps | null => {
  return googleMapsLoader.getGoogleMaps();
};

// Type declarations for Google Maps
declare global {
  interface Window {
    google?: {
      maps: typeof google.maps;
    };
  }
}