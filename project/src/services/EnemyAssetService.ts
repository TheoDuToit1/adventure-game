import { supabase } from '../lib/supabase'

export interface MMEnemyData {
  id: string
  name: string
  type: string
  health: number
  speed: number
  damage: number
  size_multiplier: number
  ai_type: string
  image_url?: string
  color: string
  created_at: string
}

export class EnemyAssetService {
  private static instance: EnemyAssetService
  private enemyCache: Map<string, MMEnemyData[]> = new Map()
  private imageCache: Map<string, HTMLImageElement> = new Map()

  static getInstance(): EnemyAssetService {
    if (!EnemyAssetService.instance) {
      EnemyAssetService.instance = new EnemyAssetService()
    }
    return EnemyAssetService.instance
  }

  async getMMEnemies(): Promise<MMEnemyData[]> {
    const cacheKey = 'mm_enemies'
    
    if (this.enemyCache.has(cacheKey)) {
      return this.enemyCache.get(cacheKey)!
    }

    try {
      // Query gauntlet_objects1 table directly for enemy types
      const { data, error } = await supabase
        .from('gauntlet_objects1')
        .select('*')
        .in('type', ['enemy', 'monster', 'creature'])

      if (error) {
        console.error('Error fetching enemies from gauntlet_objects1:', error)
        return this.getEnhancedFallbackEnemies()
      }

      if (!data || data.length === 0) {
        console.warn('No enemies found in gauntlet_objects1, using enhanced fallback data')
        return this.getEnhancedFallbackEnemies()
      }

      const enemies: MMEnemyData[] = data.map(item => ({
        id: item.id,
        name: item.name || 'Unknown Enemy',
        type: item.type || 'enemy',
        health: Math.floor(Math.random() * 5) + 2, // 2-6 health
        speed: Math.random() * 2 + 0.5, // 0.5-2.5 speed
        damage: Math.floor(Math.random() * 3) + 1, // 1-3 damage
        size_multiplier: Math.random() * 1.5 + 0.5, // 0.5-2.0 size
        ai_type: ['aggressive', 'patrol', 'guard'][Math.floor(Math.random() * 3)],
        image_url: item.image_url,
        color: item.color || '#FF0000',
        created_at: item.created_at
      }))

      this.enemyCache.set(cacheKey, enemies)
      console.log(`🧌 Loaded ${enemies.length} MM enemies from gauntlet_objects1`)
      return enemies
    } catch (error) {
      console.error('Error fetching MM enemies:', error)
      return this.getEnhancedFallbackEnemies()
    }
  }

  private getEnhancedFallbackEnemies(): MMEnemyData[] {
    return [
      {
        id: 'mm_zombie',
        name: 'Zombie MM',
        type: 'mm',
        health: 8,
        speed: 0.5,
        damage: 2,
        size_multiplier: 1.1,
        ai_type: 'aggressive',
        image_url: '/src/public/mm1.png', // Local asset path
        color: '#7A7A7A', // Zombie gray-green
        created_at: new Date().toISOString()
      },
      {
        id: 'mm1',
        name: 'Goblin Warrior',
        type: 'goblin',
        health: 3,
        speed: 1.4,
        damage: 1,
        size_multiplier: 0.8,
        ai_type: 'aggressive',
        color: '#22C55E',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm2',
        name: 'Goblin Scout',
        type: 'goblin',
        health: 2,
        speed: 1.8,
        damage: 1,
        size_multiplier: 0.7,
        ai_type: 'patrol',
        color: '#16A34A',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm3',
        name: 'Orc Brute',
        type: 'orc',
        health: 6,
        speed: 0.8,
        damage: 3,
        size_multiplier: 1.4,
        ai_type: 'aggressive',
        color: '#DC2626',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm4',
        name: 'Orc Berserker',
        type: 'orc',
        health: 5,
        speed: 1.1,
        damage: 2,
        size_multiplier: 1.2,
        ai_type: 'aggressive',
        color: '#B91C1C',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm5',
        name: 'Shadow Stalker',
        type: 'shadow',
        health: 2,
        speed: 2.2,
        damage: 3,
        size_multiplier: 0.6,
        ai_type: 'patrol',
        color: '#8B5CF6',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm6',
        name: 'Shadow Wraith',
        type: 'shadow',
        health: 3,
        speed: 1.8,
        damage: 2,
        size_multiplier: 0.8,
        ai_type: 'guard',
        color: '#6B46C1',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm7',
        name: 'Giant Spider',
        type: 'spider',
        health: 4,
        speed: 1.3,
        damage: 2,
        size_multiplier: 1.6,
        ai_type: 'aggressive',
        color: '#92400E',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm8',
        name: 'Venomous Spider',
        type: 'spider',
        health: 3,
        speed: 1.6,
        damage: 3,
        size_multiplier: 1.2,
        ai_type: 'patrol',
        color: '#7C2D12',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm9',
        name: 'Skeleton Warrior',
        type: 'skeleton',
        health: 4,
        speed: 1.0,
        damage: 2,
        size_multiplier: 1.0,
        ai_type: 'guard',
        color: '#E5E7EB',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm10',
        name: 'Bone Archer',
        type: 'skeleton',
        health: 3,
        speed: 1.2,
        damage: 2,
        size_multiplier: 0.9,
        ai_type: 'patrol',
        color: '#D1D5DB',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm11',
        name: 'Fire Imp',
        type: 'demon',
        health: 2,
        speed: 2.0,
        damage: 2,
        size_multiplier: 0.6,
        ai_type: 'aggressive',
        color: '#F97316',
        created_at: new Date().toISOString()
      },
      {
        id: 'mm12',
        name: 'Ice Elemental',
        type: 'elemental',
        health: 5,
        speed: 0.9,
        damage: 2,
        size_multiplier: 1.3,
        ai_type: 'guard',
        color: '#06B6D4',
        created_at: new Date().toISOString()
      }
    ]
  }

  async getRandomMMEnemy(): Promise<MMEnemyData> {
    const enemies = await this.getMMEnemies()
    const randomIndex = Math.floor(Math.random() * enemies.length)
    return enemies[randomIndex]
  }

  async loadEnemyImage(imageUrl: string): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(imageUrl)) {
      return this.imageCache.get(imageUrl)!
    }

    try {
      const image = await this.loadImage(imageUrl)
      this.imageCache.set(imageUrl, image)
      return image
    } catch (error) {
      console.error('Failed to load enemy image:', imageUrl, error)
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