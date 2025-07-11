import { ProcessedAnimations } from './CharacterAssetService';

export interface AnimationFrame {
  src: string;
  index: number;
}

export class CharacterFolderService {
  private static instance: CharacterFolderService;
  private imageCache: Map<string, HTMLImageElement> = new Map();
  
  static getInstance(): CharacterFolderService {
    if (!CharacterFolderService.instance) {
      CharacterFolderService.instance = new CharacterFolderService();
    }
    return CharacterFolderService.instance;
  }
  
  async loadCharacterFromFolder(characterName: string): Promise<ProcessedAnimations | null> {
    try {
      console.log(`🔍 Loading character from folder: ${characterName}`);
      
      // Base path for character animations
      const basePath = `/${characterName}`;
      
      // Define animation states and directions
      const states = ['idle', 'walk', 'attack'];
      const directions = ['north', 'south', 'east', 'west'];
      const dirMap = {
        'north': 'Up',
        'south': 'Down',
        'east': 'Right',
        'west': 'Left'
      };
      
      // Create the animation structure
      const animations: ProcessedAnimations = {
        idle: {},
        walk: {},
        attack: {}
      };
      
      // Generate paths for each animation state and direction
      for (const state of states) {
        for (const direction of directions) {
          const dirSuffix = dirMap[direction];
          let folderPath = `${state}_${dirSuffix}`;
          // For attack, use Swing_X folders for assasin-wolf
          if (state === 'attack' && characterName === 'assasin-wolf') {
            folderPath = `Swing_${dirSuffix}`;
          }
          // Generate paths for 7 frames (000.png to 006.png)
          const framePaths: string[] = [];
          for (let i = 0; i < 7; i++) {
            const paddedIndex = i.toString().padStart(3, '0');
            framePaths.push(`${basePath}/${folderPath}/${paddedIndex}.png`);
          }
          animations[state][direction] = framePaths;
          console.log(`✅ Generated ${framePaths.length} frame paths for ${state}/${direction}`);
        }
      }
      
      return animations;
    } catch (error) {
      console.error('💥 Error loading character from folder:', error);
      return null;
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