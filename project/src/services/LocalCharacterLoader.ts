import { ProcessedAnimations } from './CharacterAssetService';

export class LocalCharacterLoader {
  private static instance: LocalCharacterLoader;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  
  static getInstance(): LocalCharacterLoader {
    if (!LocalCharacterLoader.instance) {
      LocalCharacterLoader.instance = new LocalCharacterLoader();
    }
    return LocalCharacterLoader.instance;
  }
  
  async loadLocalCharacter(characterName: string): Promise<ProcessedAnimations | null> {
    try {
      console.log('🔍 Loading local animations for character:', characterName);
      
      const animations: ProcessedAnimations = {
        idle: {
          north: await this.loadDirectoryImages('assasin-wolf/Idle_Up'),
          south: await this.loadDirectoryImages('assasin-wolf/Idle_Down'),
          east: await this.loadDirectoryImages('assasin-wolf/Idle_Right'),
          west: await this.loadDirectoryImages('assasin-wolf/Idle_Left')
        },
        walk: {
          north: await this.loadDirectoryImages('assasin-wolf/Walk_Up'),
          south: await this.loadDirectoryImages('assasin-wolf/Walk_Down'),
          east: await this.loadDirectoryImages('assasin-wolf/Walk_Right'),
          west: await this.loadDirectoryImages('assasin-wolf/Walk_Left')
        },
        attack: {
          north: await this.loadDirectoryImages('assasin-wolf/Swing_Up'),
          south: await this.loadDirectoryImages('assasin-wolf/Swing_Down'),
          east: await this.loadDirectoryImages('assasin-wolf/Swing_Right'),
          west: await this.loadDirectoryImages('assasin-wolf/Swing_Left')
        }
      };
      
      return animations;
    } catch (error) {
      console.error('💥 Error loading local character animations:', error);
      return null;
    }
  }
  
  private async loadDirectoryImages(dirPath: string): Promise<string[]> {
    const paths: string[] = [];
    try {
      for (let i = 0; i < 7; i++) {
        const paddedIndex = i.toString().padStart(3, '0');
        paths.push(`/${dirPath}/${paddedIndex}.png`);
      }
      console.log(`✅ Generated ${paths.length} paths for ${dirPath}`);
      return paths;
    } catch (error) {
      console.error(`❌ Error loading images from directory ${dirPath}:`, error);
      return [];
    }
  }
  
  async loadImageFromPath(path: string): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(path)) {
      return this.imageCache.get(path)!;
    }
    
    try {
      const image = await this.loadImage(path);
      this.imageCache.set(path, image);
      return image;
    } catch (error) {
      console.error('❌ Failed to load image from path:', path, error);
      return null;
    }
  }
  
  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }
} 