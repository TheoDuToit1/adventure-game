import React, { useRef, useEffect, useState } from 'react'
import { ChestConfig } from '../../types/game'
import { ObjectAssetService, GameObjectData } from '../../services/ObjectAssetService'
import chestImgSrc from '../../assets/chest.png'
import foodPlatterImgSrc from '../../assets/food-plater.png'
import keyImgSrc from '../../assets/key.png'

interface GameObjectsProps {
  chests: ChestConfig[]
  tileSize: number
  chestsOpened: Set<number>
  cameraPosition: { x: number, y: number }
  width: number
  height: number
  foodPlatters?: { id: number, position: { x: number, y: number }, isEaten?: boolean }[]
  keys?: { id: number, position: { x: number, y: number }, isCollected?: boolean }[]
  doors?: { id: number, position: { x: number, y: number }, isOpen?: boolean }[]
}

export const GameObjects: React.FC<GameObjectsProps> = ({ chests, tileSize, chestsOpened, cameraPosition, width, height, foodPlatters, keys, doors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chestImg = useRef<HTMLImageElement | null>(null)
  const foodPlatterImg = useRef<HTMLImageElement | null>(null)
  const keyImg = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    // Load the local chest image
    const img = new window.Image()
    img.src = chestImgSrc
    chestImg.current = img
    // Load the local food platter image
    const foodImg = new window.Image()
    foodImg.src = foodPlatterImgSrc
    foodPlatterImg.current = foodImg
    const keyImage = new window.Image()
    keyImage.src = keyImgSrc
    keyImg.current = keyImage
  }, [])

  // Draw a fallback chest with Gauntlet II style
  const drawFallbackChest = (ctx: CanvasRenderingContext2D, chest: ChestConfig, size: number, offsetX: number, offsetY: number) => {
    ctx.fillStyle = '#D97706'
    ctx.fillRect(
      chest.position.x - offsetX + 4,
      chest.position.y - offsetY + 4,
      size - 8,
      size - 8
    )
    ctx.fillStyle = '#F59E0B'
    ctx.fillRect(
      chest.position.x - offsetX + 8,
      chest.position.y - offsetY + 8,
      size - 16,
      4
    )
    ctx.fillStyle = '#FBBF24'
    ctx.fillRect(
      chest.position.x - offsetX + (size / 2) - 2,
      chest.position.y - offsetY + 6,
      4,
      8
    )
          }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    chests.forEach(chest => {
      if (chestsOpened.has(chest.id)) return // Don't render opened chests
      if (chestImg.current) {
        try {
          ctx.drawImage(
            chestImg.current,
            chest.position.x - cameraPosition.x,
            chest.position.y - cameraPosition.y,
            tileSize,
            tileSize
          )
        } catch (error) {
          drawFallbackChest(ctx, chest, tileSize, cameraPosition.x, cameraPosition.y)
        }
      } else {
        drawFallbackChest(ctx, chest, tileSize, cameraPosition.x, cameraPosition.y)
      }
    })
    // Draw food platters
    if (foodPlatters && foodPlatterImg.current) {
      foodPlatters.forEach(fp => {
        if (fp.isEaten) return
        if (foodPlatterImg.current) {
          try {
            ctx.drawImage(
              foodPlatterImg.current,
              fp.position.x - cameraPosition.x,
              fp.position.y - cameraPosition.y,
              tileSize,
              tileSize
            )
          } catch (error) {
            // fallback: draw a red square
            ctx.fillStyle = '#FF0000'
            ctx.fillRect(fp.position.x - cameraPosition.x, fp.position.y - cameraPosition.y, tileSize, tileSize)
          }
        }
      })
    }
    // Draw keys
    if (keys) {
      keys.forEach(key => {
        if (key.isCollected) return
        // Remove fallback yellow square background
        // Draw key image smaller and centered
        let drewImage = false;
        const keySize = tileSize * 0.6;
        const keyOffset = (tileSize - keySize) / 2;
        if (keyImg.current && keyImg.current.complete && keyImg.current.naturalWidth > 0) {
          ctx.drawImage(
            keyImg.current,
            key.position.x - cameraPosition.x + keyOffset,
            key.position.y - cameraPosition.y + keyOffset + 2.5, // shift down by half the reduction to keep centered
            keySize,
            keySize - 5 // reduce height by 5px
          )
          drewImage = true;
        }
        // Fallback: draw a simple key shape if image not loaded
        if (!drewImage) {
          const x = key.position.x - cameraPosition.x + tileSize / 2;
          const y = key.position.y - cameraPosition.y + tileSize / 2;
          ctx.save();
          ctx.strokeStyle = '#FFD700';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x - 6, y, 6, 0, 2 * Math.PI); // key ring
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 8, y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 6, y - 3);
          ctx.lineTo(x + 6, y + 3);
          ctx.stroke();
          ctx.restore();
        }
    })
    }
    // Draw doors
    if (doors) {
      doors.forEach(door => {
        if (door.isOpen) return
        // REMOVE: Do not render fallback brown door block here
        // (Door rendering is handled in GameCanvas or elsewhere)
      })
    }
  }, [chests, tileSize, chestsOpened, cameraPosition, width, height, foodPlatters, keys, doors])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
    />
  )
}