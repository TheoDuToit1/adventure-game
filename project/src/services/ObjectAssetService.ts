import { supabase } from '../lib/supabase'

export interface GameObjectData {
  id: string
  code: string
  name: string
  color: string
  image_url: string
  type: string
  created_at: string
}

export class ObjectAssetService {
  private static instance: ObjectAssetService
  private objectCache: Map<string, GameObjectData[]> = new Map()
  private imageCache: Map<string, HTMLImageElement> = new Map()

  static getInstance(): ObjectAssetService {
    if (!ObjectAssetService.instance) {
      ObjectAssetService.instance = new ObjectAssetService()
    }
    return ObjectAssetService.instance
  }

  async getObjectsByType(type: string): Promise<GameObjectData[]> {
    const cacheKey = type.toLowerCase()
    
    if (this.objectCache.has(cacheKey)) {
      return this.objectCache.get(cacheKey)!
    }

    try {
      const { data, error } = await supabase
        .from('gauntlet_objects1')
        .select('*')
        .eq('type', type)

      if (error) {
        console.warn('Failed to fetch objects from database:', error)
        return []
      }

      if (!data || data.length === 0) {
        console.warn(`No objects found for type: ${type}`)
        return []
      }

      const objects: GameObjectData[] = data.map(row => ({
        id: row.id,
        code: row.code,
        name: row.name,
        color: row.color,
        image_url: row.image_url,
        type: row.type,
        created_at: row.created_at
      }))

      this.objectCache.set(cacheKey, objects)
      console.log(`📦 Loaded ${objects.length} objects for type: ${type}`)
      return objects
    } catch (error) {
      console.error('Error fetching game objects:', error)
      return []
    }
  }

  async getRandomChest(): Promise<GameObjectData | null> {
    try {
      // Try to get chest objects from database
      const chests = await this.getObjectsByType('chest')
      
      // If we have chests, return a random one
      if (chests && chests.length > 0) {
        const randomIndex = Math.floor(Math.random() * chests.length)
        return chests[randomIndex]
      }
      
      // If no chests found in database, create a default chest object
      return {
        id: 'default-chest',
        code: 'chest',
        name: 'Treasure Chest',
        color: '#D97706', // Golden brown color
        image_url: '/assets/chest.png', // Default chest image in public assets
        type: 'chest',
        created_at: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting random chest:', error)
      return null
    }
  }

  async loadObjectImage(imageUrl: string): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(imageUrl)) {
      return this.imageCache.get(imageUrl)!
    }

    try {
      const image = await this.loadImage(imageUrl)
      this.imageCache.set(imageUrl, image)
      return image
    } catch (error) {
      console.error('Failed to load object image:', imageUrl, error)
      return null
    }
  }

  async loadGruntSpawnerImage(): Promise<HTMLImageElement | null> {
    // Use a direct path to the image in the public directory
    const imageUrl = '/assets/bonepile.png'
    
    if (this.imageCache.has(imageUrl)) {
      return this.imageCache.get(imageUrl)!
    }

    try {
      const image = await this.loadImage(imageUrl)
      this.imageCache.set(imageUrl, image)
      return image
    } catch (error) {
      console.error('Failed to load grunt spawner image:', error)
      return null
    }
  }

  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
      img.src = url
    })
  }
}