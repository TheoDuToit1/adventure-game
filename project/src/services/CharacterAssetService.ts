import { supabase } from '../lib/supabase'

export interface CharacterAnimationData {
  id: string
  name: string
  character_class: string
  Idle: Record<string, string[]>
  Walk: Record<string, string[]>
  Attack?: Record<string, string[]>
  created_at?: string
}

export interface ProcessedAnimations {
  idle: Record<string, string[]>
  walk: Record<string, string[]>
  attack: Record<string, string[]>
}

export class CharacterAssetService {
  private static instance: CharacterAssetService
  private characterCache: Map<string, ProcessedAnimations> = new Map()
  private imageCache: Map<string, HTMLImageElement> = new Map()

  static getInstance(): CharacterAssetService {
    if (!CharacterAssetService.instance) {
      CharacterAssetService.instance = new CharacterAssetService()
    }
    return CharacterAssetService.instance
  }

  async loadCharacterAnimations(characterName: string): Promise<ProcessedAnimations | null> {
    const cacheKey = characterName.toLowerCase()
    
    if (this.characterCache.has(cacheKey)) {
      console.log(`📦 Using cached animations for: ${characterName}`)
      return this.characterCache.get(cacheKey)!
    }

    try {
      console.log(`🔍 Loading animations for character: ${characterName}`)
      
      // First try to get animations by name - select only necessary columns
      let { data, error } = await supabase
        .from('character_animations')
        .select('id, name, character_class, Idle, Walk')
        .eq('name', characterName.toLowerCase())
        
      let characterData = null
      
      if (error) {
        console.log(`❌ Error querying by name "${characterName}":`, error)
      } else if (data && data.length > 0) {
        characterData = data[0]
        console.log(`✅ Found character by name: ${characterName}`)
      } else {
        console.log(`❌ No animations found by name "${characterName}", trying character_class...`)
      }
      
      // Fallback to character_class if no data found by name
      if (!characterData) {
        const classResult = await supabase
          .from('character_animations')
          .select('id, name, character_class, Idle, Walk')
          .eq('character_class', characterName.toLowerCase())
          
        if (classResult.error) {
          console.log(`❌ Error querying by character_class "${characterName}":`, classResult.error)
        } else if (classResult.data && classResult.data.length > 0) {
          characterData = classResult.data[0]
          console.log(`✅ Found character by character_class: ${characterName}`)
        } else {
          console.log(`❌ No animations found by character_class "${characterName}"`)
        }
      }
      
      if (!characterData) {
        console.error('❌ No animations found for this character')
        return null
      }

      console.log('✅ Raw animation data from Supabase:', characterData)
      const processedAnimations = this.adaptAnimationData(characterData)
      
      if (processedAnimations) {
        this.characterCache.set(cacheKey, processedAnimations)
        console.log('🎯 Successfully processed and cached animations')
      }
      
      return processedAnimations
    } catch (error) {
      console.error('💥 Error loading character animations:', error)
      return null
    }
  }

  private adaptAnimationData(animationData: CharacterAnimationData): ProcessedAnimations | null {
    if (!animationData) return null
    
    console.log('🔄 Adapting animation data:', animationData)
    
    // Create the animation structure
    const animations: ProcessedAnimations = {
      idle: {},
      walk: {},
      attack: {}
    }
    
    // Direction mapping (database uses n,s,e,w but component expects north,south,east,west)
    const directionMap: Record<string, string> = {
      'n': 'north',
      's': 'south',
      'e': 'east',
      'w': 'west',
      'north': 'north',
      'south': 'south',
      'east': 'east',
      'west': 'west'
    }
    
    // Process Idle animations
    if (animationData.Idle) {
      console.log('🧘 Processing Idle animations:', animationData.Idle)
      Object.entries(animationData.Idle).forEach(([dir, frames]) => {
        const mappedDir = directionMap[dir.toLowerCase()] || dir.toLowerCase()
        if (frames && Array.isArray(frames)) {
          animations.idle[mappedDir] = frames.map(frame => 
            typeof frame === 'string' ? frame : (frame as any).data || '')
          console.log(`✅ Processed idle ${mappedDir}: ${frames.length} frames`)
        }
      })
    }
    
    // Process Walk animations
    if (animationData.Walk) {
      console.log('🚶 Processing Walk animations:', animationData.Walk)
      Object.entries(animationData.Walk).forEach(([dir, frames]) => {
        const mappedDir = directionMap[dir.toLowerCase()] || dir.toLowerCase()
        if (frames && Array.isArray(frames)) {
          animations.walk[mappedDir] = frames.map(frame => 
            typeof frame === 'string' ? frame : (frame as any).data || '')
          console.log(`✅ Processed walk ${mappedDir}: ${frames.length} frames`)
        }
      })
    }
    
    // Process Attack animations
    if (animationData.Attack) {
      console.log('⚔️ Processing Attack animations:', animationData.Attack)
      Object.entries(animationData.Attack).forEach(([dir, frames]) => {
        const mappedDir = directionMap[dir.toLowerCase()] || dir.toLowerCase()
        if (frames && Array.isArray(frames)) {
          animations.attack[mappedDir] = frames.map(frame => 
            typeof frame === 'string' ? frame : (frame as any).data || '')
          console.log(`✅ Processed attack ${mappedDir}: ${frames.length} frames`)
        }
      })
    }
    
    // If no attack animations are available, use walk animations as fallback
    if (!animationData.Attack || Object.keys(animations.attack).length === 0) {
      console.log('⚠️ No attack animations found, using walk animations as fallback')
      animations.attack = { ...animations.walk }
    }
    
    console.log('🎨 Final processed animations:', animations)
    return animations
  }

  async loadImageFromBase64(base64Data: string): Promise<HTMLImageElement | null> {
    if (this.imageCache.has(base64Data)) {
      return this.imageCache.get(base64Data)!
    }

    try {
      // Ensure the base64 data has the proper data URL prefix
      const dataUrl = base64Data.startsWith('data:') 
        ? base64Data 
        : `data:image/png;base64,${base64Data}`

      const image = await this.loadImage(dataUrl)
      this.imageCache.set(base64Data, image)
      return image
    } catch (error) {
      console.error('❌ Failed to load image from base64:', error)
      return null
    }
  }

  private async loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${url.substring(0, 50)}...`))
      img.src = url
    })
  }

  generateFallbackFrame(direction: string, frameIndex: number, size: number = 32): string {
    const canvas = document.createElement('canvas')
    // Ensure consistent canvas size
    canvas.width = size
    canvas.height = size
    
    const ctx = canvas.getContext('2d')!
    
    // Clear the canvas with transparent background
    ctx.clearRect(0, 0, size, size)
    
    // Generate simple colored rectangles as fallback sprites
    const colors: Record<string, string> = {
      north: '#4F46E5',
      south: '#06B6D4', 
      east: '#10B981',
      west: '#F59E0B'
    }

    const color = colors[direction] || '#6B7280'
    
    // Background - make it slightly smaller to ensure consistent sizing
    const padding = 2
    ctx.fillStyle = color
    ctx.fillRect(padding, padding, size - padding * 2, size - padding * 2)
    
    // Add simple animation variation - keep it small and consistent
    const offset = Math.sin(frameIndex * 0.5) * 1 // Reduced from 2 to 1
    ctx.fillStyle = '#FFFFFF'
    const innerSize = Math.floor((size - padding * 2) * 0.5) // Proportional to canvas size
    const innerX = padding + offset + (size - padding * 2 - innerSize) / 2
    const innerY = padding + (size - padding * 2 - innerSize) / 2
    ctx.fillRect(innerX, innerY, innerSize, innerSize)
    
    // Add direction indicator - scale font size with canvas size
    ctx.fillStyle = '#000000'
    const fontSize = Math.max(6, Math.floor(size / 4))
    ctx.font = `${fontSize}px monospace`
    ctx.fillText(direction[0].toUpperCase(), padding + 1, padding + fontSize)
    ctx.fillText(`${frameIndex}`, padding + 1, padding + fontSize * 2)

    return canvas.toDataURL()
  }
}