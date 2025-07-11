import React, { useRef, useEffect, useState } from 'react'
import { CharacterAssetService, ProcessedAnimations } from '../../services/CharacterAssetService'
import { LocalCharacterLoader } from '../../services/LocalCharacterLoader'
import { CharacterFolderService } from '../../services/CharacterFolderService'

interface AnimatedCharacterProps {
  direction: 'north' | 'south' | 'east' | 'west'
  state: 'idle' | 'walk' | 'attack'
  characterName: string
  size: number
  debug?: boolean
  hitFlash?: number // Timestamp when the player was hit
  useLocalAssets?: boolean // Flag to use local assets instead of database
}

export const AnimatedCharacter: React.FC<AnimatedCharacterProps> = ({
  direction,
  state,
  characterName,
  size,
  debug = false,
  hitFlash,
  useLocalAssets = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [animations, setAnimations] = useState<ProcessedAnimations | null>(null)
  const [loadedFrames, setLoadedFrames] = useState<Map<string, HTMLImageElement[]>>(new Map<string, HTMLImageElement[]>())
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const animationRef = useRef<number>()
  const lastFrameTime = useRef(0)
  const attackAnimationStartTime = useRef<number | null>(null)

  // Load character animations from database or local files
  useEffect(() => {
    const loadAnimations = async () => {
      setIsLoading(true)
      
      try {
        console.log(`🎭 Loading animations for: ${characterName}`)
        let animData = null;
        
        if (useLocalAssets || characterName === 'mage-fire' || characterName === 'assasin-wolf') {
          // Use the folder service for local assets
          const folderService = CharacterFolderService.getInstance();
          animData = await folderService.loadCharacterFromFolder(characterName);
        } else {
          // Use the database loader for other characters
          const characterService = CharacterAssetService.getInstance();
          animData = await characterService.loadCharacterAnimations(characterName);
        }
        
        if (animData) {
          setAnimations(animData)
          console.log('✅ Character animations loaded successfully')
        } else {
          console.warn('⚠️ No animations found, will use fallbacks')
          setAnimations(null)
        }
      } catch (error) {
        console.error('💥 Error loading character animations:', error)
        setAnimations(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadAnimations()
  }, [characterName, useLocalAssets])

  // Load frame images when animations change
  useEffect(() => {
    if (!animations) return

    const loadFrameImages = async () => {
      const characterService = CharacterAssetService.getInstance()
      const folderService = CharacterFolderService.getInstance()
      const newLoadedFrames = new Map<string, HTMLImageElement[]>()

      console.log('🖼️ Loading frame images...')

      for (const [animState, directions] of Object.entries(animations)) {
        for (const [dir, framesArray] of Object.entries(directions)) {
          const key = `${animState}_${dir}`
          const frameImages: HTMLImageElement[] = []

          // Ensure frames is treated as a string array
          const frames = framesArray as string[];
          console.log(`🎬 Loading ${frames.length} frames for ${key}`)

          for (let i = 0; i < frames.length; i++) {
            const frameData = frames[i]
            
            if (frameData && frameData.trim()) {
              try {
                let image = null;
                
                // Check if this is a path (for local images) or base64 data
                if (frameData.startsWith('/')) {
                  // Local image path
                  image = await folderService.loadImageFromPath(frameData);
                } else {
                  // Base64 data from database
                  image = await characterService.loadImageFromBase64(frameData);
                }
                
                if (image) {
                  frameImages.push(image)
                  console.log(`✅ Loaded frame ${i} for ${key}`)
                } else {
                  // Generate fallback frame
                  const fallbackData = characterService.generateFallbackFrame(dir, i, size)
                  const fallbackImage = await characterService.loadImageFromBase64(fallbackData)
                  if (fallbackImage) {
                    frameImages.push(fallbackImage)
                    console.log(`🔄 Generated fallback frame ${i} for ${key}`)
                  }
                }
              } catch (error) {
                console.error(`❌ Error loading frame ${i} for ${key}:`, error)
                // Generate fallback frame
                const fallbackData = characterService.generateFallbackFrame(dir, i, size)
                const fallbackImage = await characterService.loadImageFromBase64(fallbackData)
                if (fallbackImage) {
                  frameImages.push(fallbackImage)
                }
              }
            } else {
              // Generate fallback frame for missing data
              const fallbackData = characterService.generateFallbackFrame(dir, i, size)
              const fallbackImage = await characterService.loadImageFromBase64(fallbackData)
              if (fallbackImage) {
                frameImages.push(fallbackImage)
                console.log(`🔄 Generated fallback for missing frame ${i} in ${key}`)
              }
            }
          }

          if (frameImages.length > 0) {
            newLoadedFrames.set(key, frameImages)
            console.log(`✅ Loaded ${frameImages.length} frames for ${key}`)
          }
        }
      }

      setLoadedFrames(newLoadedFrames)
    }

    loadFrameImages()
  }, [animations, size])

  // Animation loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!canvasRef.current) return

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')!
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Get current animation frames
      const animKey = `${state}_${direction}`
      const currentFrames: HTMLImageElement[] = loadedFrames.get(animKey) ?? [];
      
      if (currentFrames.length === 0) {
        // Draw fallback if no frames available
        if (!isLoading) {
          ctx.fillStyle = '#FF6B6B'
          ctx.fillRect(0, 0, size, size)
          ctx.fillStyle = '#FFFFFF'
          ctx.font = '8px monospace'
          ctx.fillText('NO', 2, 10)
          ctx.fillText('ANIM', 2, 20)
        }
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      // Animation timing
      let frameRate = 500; // Default for idle
      
      if (state === 'walk') {
        frameRate = 150; // Faster for walking
      } else if (state === 'attack') {
        frameRate = 100; // Even faster for attacking
        
        // Initialize attack animation start time if not set
        if (attackAnimationStartTime.current === null) {
          attackAnimationStartTime.current = timestamp;
        }
      } else {
        // Reset attack animation time for non-attack states
        attackAnimationStartTime.current = null;
      }
      
      if (timestamp - lastFrameTime.current >= frameRate) {
        if (state === 'attack') {
          // For attack animation, progress through frames and don't loop
          const attackDuration = frameRate * currentFrames.length;
          const attackProgress = timestamp - (attackAnimationStartTime.current || timestamp);
          
          if (attackProgress < attackDuration) {
            const frameIndex = Math.min(
              Math.floor(attackProgress / frameRate),
              currentFrames.length - 1
            );
            setCurrentFrame(frameIndex);
          }
        } else if (state === 'walk') {
          // Normal looping animation for walk
          setCurrentFrame(prev => (prev + 1) % currentFrames.length);
        } else {
          // For idle, use first frame or slow animation
          setCurrentFrame(prev => (prev + 1) % currentFrames.length);
        }
        
        lastFrameTime.current = timestamp;
      }

      // Draw current frame
      const frameIndex = Math.min(currentFrame, currentFrames.length - 1);
      const frame = currentFrames[frameIndex];
      
      if (frame && frame.complete && frame.naturalWidth > 0) {
        try {
          // Draw the character
          ctx.drawImage(
            frame,
            0, 0, frame.width, frame.height,
            0, 0, size, size
          )
          
          // Apply hit flash effect if player was recently hit
          const timeSinceHit = hitFlash ? timestamp - hitFlash : Infinity;
          if (timeSinceHit < 500) { // Flash for 500ms
            // Save context to restore after drawing the flashing effect
            ctx.save();
            
            // Set global composite operation to overlay the red flash
            ctx.globalCompositeOperation = 'source-atop';
            
            // Flash with opacity that fades out over time
            const opacity = 0.7 * (1 - timeSinceHit / 500);
            ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
            ctx.fillRect(0, 0, size, size);
            
            ctx.restore();
          }
        } catch (drawError) {
          console.error('❌ Draw error:', drawError)
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [direction, state, currentFrame, loadedFrames, size, isLoading, hitFlash])

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          imageRendering: 'pixelated',
          display: 'block'
        }}
      />
      
      {debug && (
        <div style={{
          position: 'absolute', 
          top: -25, 
          left: 0, 
          fontSize: '10px',
          backgroundColor: 'rgba(0,0,0,0.8)', 
          color: 'white', 
          padding: '2px 4px',
          borderRadius: '2px',
          whiteSpace: 'nowrap'
        }}>
          {direction}/{state} - Frame: {currentFrame}
          {isLoading && ' (Loading...)'}
        </div>
      )}
    </div>
  )
}
