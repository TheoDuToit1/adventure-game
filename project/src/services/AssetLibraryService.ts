import { supabase } from '../lib/supabase'
import { CharacterAnimation } from '../types/game'

export class AssetLibraryService {
  private static instance: AssetLibraryService
  private animationCache: Map<string, CharacterAnimation[]> = new Map()

  static getInstance(): AssetLibraryService {
    if (!AssetLibraryService.instance) {
      AssetLibraryService.instance = new AssetLibraryService()
    }
    return AssetLibraryService.instance
  }

  async getCharacterAnimations(character: string): Promise<CharacterAnimation[]> {
    const cacheKey = character.toLowerCase()
    
    if (this.animationCache.has(cacheKey)) {
      return this.animationCache.get(cacheKey)!
    }

    try {
      // Try multiple query approaches to find the character
      let data = null
      let error = null

      // First try: exact name match
      const result1 = await supabase
        .from('character_animations')
        .select('*')
        .eq('name', character)

      if (result1.data && result1.data.length > 0) {
        data = result1.data
      } else {
        // Second try: case-insensitive name match
        const result2 = await supabase
          .from('character_animations')
          .select('*')
          .ilike('name', character)

        if (result2.data && result2.data.length > 0) {
          data = result2.data
        } else {
          // Third try: get all records and filter manually
          const result3 = await supabase
            .from('character_animations')
            .select('*')

          if (result3.data) {
            data = result3.data.filter(record => 
              record.name && record.name.toLowerCase().includes(character.toLowerCase())
            )
          }
          error = result3.error
        }
      }

      if (error && !data) {
        console.warn('Supabase query failed:', error)
        return this.getFallbackAnimations(character)
      }

      if (!data || data.length === 0) {
        console.warn('No character data found for:', character)
        return this.getFallbackAnimations(character)
      }

      const animations: CharacterAnimation[] = []
      const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west']
      const directionMap = {
        'north': 'n',
        'south': 's', 
        'east': 'e',
        'west': 'w'
      }

      // Process the first matching character record
      const characterData = data[0]
      
      for (const direction of directions) {
        const shortDir = directionMap[direction]
        
        // Check if Walk animation data exists for this direction
        const walkData = characterData.Walk || {}
        const directionData = walkData[shortDir] || walkData[direction]
        
        if (directionData && (directionData.spriteUrl || directionData.sprite_url)) {
          const spriteUrl = directionData.spriteUrl || directionData.sprite_url
          
          animations.push({
            id: `${character}_${direction}`,
            character,
            direction,
            frameCount: directionData.frameCount || directionData.frame_count || 4,
            spriteUrl: spriteUrl,
            frameWidth: directionData.frameWidth || directionData.frame_width || 32,
            frameHeight: directionData.frameHeight || directionData.frame_height || 32
          })
        } else {
          // Add fallback animation for this direction
          animations.push({
            id: `${character}_${direction}_fallback`,
            character,
            direction,
            frameCount: 4,
            spriteUrl: '',
            frameWidth: 32,
            frameHeight: 32
          })
        }
      }

      this.animationCache.set(cacheKey, animations)
      return animations
    } catch (error) {
      console.error('Error fetching character animations:', error)
      return this.getFallbackAnimations(character)
    }
  }

  private getFallbackAnimations(character: string): CharacterAnimation[] {
    // Fallback to procedurally generated placeholder animations
    const directions: ('north' | 'south' | 'east' | 'west')[] = ['north', 'south', 'east', 'west']
    
    return directions.map(direction => ({
      id: `${character}_${direction}_fallback`,
      character,
      direction,
      frameCount: 4,
      spriteUrl: '', // Will be handled by sprite loader
      frameWidth: 32,
      frameHeight: 32
    }))
  }

  async getAssetUrl(path: string): Promise<string> {
    try {
      const { data } = await supabase.storage
        .from('sprites')
        .createSignedUrl(path, 3600)
      
      return data?.signedUrl || ''
    } catch (error) {
      console.error('Error getting asset URL:', error)
      return ''
    }
  }
}