import { CharacterAnimation, AnimationFrame } from '../types/game'

export class SpriteSheetLoader {
  private static instance: SpriteSheetLoader
  private imageCache: Map<string, HTMLImageElement> = new Map()
  private frameCache: Map<string, AnimationFrame[]> = new Map()

  static getInstance(): SpriteSheetLoader {
    if (!SpriteSheetLoader.instance) {
      SpriteSheetLoader.instance = new SpriteSheetLoader()
    }
    return SpriteSheetLoader.instance
  }

  async loadCharacterFrames(animation: CharacterAnimation): Promise<AnimationFrame[]> {
    const cacheKey = `${animation.character}_${animation.direction}`
    
    if (this.frameCache.has(cacheKey)) {
      return this.frameCache.get(cacheKey)!
    }

    try {
      let image: HTMLImageElement

      if (animation.spriteUrl) {
        image = await this.loadImage(animation.spriteUrl)
      } else {
        image = await this.generateFallbackSprite(animation)
      }

      const frames = await this.sliceVerticalFrames(image, animation.frameCount)
      this.frameCache.set(cacheKey, frames)
      return frames
    } catch (error) {
      console.error('Error loading character frames:', error)
      // Return fallback frames
      const fallbackImage = await this.generateFallbackSprite(animation)
      const frames = await this.sliceVerticalFrames(fallbackImage, animation.frameCount)
      this.frameCache.set(cacheKey, frames)
      return frames
    }
  }

  private async loadImage(url: string): Promise<HTMLImageElement> {
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url)!
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous' // Handle CORS for Supabase images
      img.onload = () => {
        this.imageCache.set(url, img)
        resolve(img)
      }
      img.onerror = (error) => {
        reject(new Error(`Failed to load image: ${url}`))
      }
      img.src = url
    })
  }

  private async sliceVerticalFrames(image: HTMLImageElement, frameCount: number): Promise<AnimationFrame[]> {
    const frames: AnimationFrame[] = []
    const frameHeight = image.height / frameCount

    for (let i = 0; i < frameCount; i++) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = frameHeight
      
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(
        image, 
        0, i * frameHeight, image.width, frameHeight,
        0, 0, image.width, frameHeight
      )

      // Create image from canvas and wait for it to load
      const frameImage = await new Promise<HTMLImageElement>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = canvas.toDataURL()
      })

      frames.push({
        image: frameImage,
        frameIndex: i,
        totalFrames: frameCount
      })
    }

    return frames
  }

  private async generateFallbackSprite(animation: CharacterAnimation): Promise<HTMLImageElement> {
    const canvas = document.createElement('canvas')
    canvas.width = animation.frameWidth
    canvas.height = animation.frameHeight * animation.frameCount
    
    const ctx = canvas.getContext('2d')!
    
    // Generate simple colored rectangles as fallback sprites
    const colors = {
      north: '#4F46E5',
      south: '#06B6D4', 
      east: '#10B981',
      west: '#F59E0B'
    }

    for (let i = 0; i < animation.frameCount; i++) {
      const y = i * animation.frameHeight
      ctx.fillStyle = colors[animation.direction]
      ctx.fillRect(0, y, animation.frameWidth, animation.frameHeight)
      
      // Add simple animation variation
      const offset = Math.sin(i * 0.5) * 2
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(offset + 8, y + 8, 16, 16)
      
      // Add direction indicator
      ctx.fillStyle = '#000000'
      ctx.font = '8px monospace'
      ctx.fillText(animation.direction[0].toUpperCase(), 2, y + 10)
      ctx.fillText(`${i}`, 2, y + 20)
    }

    // Return a promise that resolves when the image is loaded
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = canvas.toDataURL()
    })
  }
}