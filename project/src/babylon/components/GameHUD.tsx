import React from 'react'
import { Heart, Coins, Zap, Beaker, Skull, X } from 'lucide-react'
import keyImgSrc from '../../assets/key.png'

interface GameHUDProps {
  health: number
  maxHealth: number
  score: number
  potions: number
  kills: number
  room: string
  enemies: number
  powerUpActive?: boolean
  powerUpType?: 'health_regen' | 'attack_buff' | 'speed_buff'
  powerUpEndTime?: number
  currentTime?: number
  onClose?: () => void
  keyCount?: number
}

export const GameHUD: React.FC<GameHUDProps> = ({ 
  health, 
  maxHealth, 
  score, 
  potions,
  kills,
  room,
  enemies,
  powerUpActive,
  powerUpType,
  powerUpEndTime,
  currentTime = Date.now(),
  onClose,
  keyCount = 0
}) => {
  // Calculate power-up time remaining
  const powerUpTimeRemaining = powerUpEndTime && currentTime ? 
    Math.max(0, Math.floor((powerUpEndTime - currentTime) / 1000)) : 0

  return (
    <div className="absolute top-0 left-0 right-0 z-30 w-full px-4 pt-2 select-none pointer-events-none">
      <div className="relative flex flex-row items-center justify-between bg-gray-900/90 backdrop-blur-sm rounded-b-lg border-b-2 border-gray-700 px-6 py-2 shadow-lg">
        {/* Close button */}
        {onClose && (
          <button
            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-full border border-gray-600 shadow pointer-events-auto"
            style={{ zIndex: 40 }}
            onClick={onClose}
            tabIndex={0}
            aria-label="Close HUD"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        {/* Health */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <Heart className="w-7 h-7 text-red-500" />
          <span className="text-white text-3xl font-extrabold font-mono drop-shadow-lg">{health}</span>
          <span className="text-gray-400 text-lg font-mono">/ {maxHealth}</span>
        </div>
        {/* Kills */}
          <div className="flex items-center gap-2">
          <Skull className="w-6 h-6 text-gray-300" />
          <span className="text-white text-xl font-bold font-mono">{kills}</span>
          <span className="text-gray-400 text-sm ml-1">KILLS</span>
          </div>
        {/* Score */}
        <div className="flex items-center gap-2">
          <Coins className="w-6 h-6 text-yellow-400" />
          <span className="text-yellow-200 text-xl font-bold font-mono">{score.toLocaleString()}</span>
          </div>
        {/* Room & Enemies */}
        <div className="flex flex-col items-center min-w-[90px]">
          <span className="text-gray-300 text-xs font-mono">ROOM</span>
          <span className="text-white text-lg font-bold font-mono">{room}</span>
          <span className="text-gray-400 text-xs font-mono mt-1">Enemies: <span className="text-white font-bold">{enemies}</span></span>
        </div>
        {/* Potions */}
        <div className="flex items-center gap-2">
          <Beaker className="w-6 h-6 text-purple-400" />
          <span className="text-white text-lg font-mono">x{potions}</span>
        </div>
        {/* Power-up */}
      {powerUpActive && powerUpType && (
          <div className={
            `flex items-center gap-2 px-3 py-1 rounded-full ml-4 pointer-events-auto animate-pulse ` +
            (powerUpType === 'health_regen' ? 'bg-green-900/80 text-green-300' : '') +
            (powerUpType === 'attack_buff' ? 'bg-red-900/80 text-red-300' : '') +
            (powerUpType === 'speed_buff' ? 'bg-blue-900/80 text-blue-300' : '')
          }>
            <Zap className="w-5 h-5" />
            <span className="font-mono text-base">
              {powerUpType === 'health_regen' && 'Health Regen'}
              {powerUpType === 'attack_buff' && 'Attack Boost'}
              {powerUpType === 'speed_buff' && 'Speed Boost'}
              {powerUpTimeRemaining > 0 && ` (${powerUpTimeRemaining}s)`}
            </span>
        </div>
      )}
        {/* Key count */}
        <div className="flex items-center gap-1">
          <img src={keyImgSrc} alt="Key" style={{ width: 18, height: 18, marginRight: 2, filter: 'drop-shadow(0 0 2px #FFD700)' }} />
          <span className="font-bold text-yellow-300" style={{ minWidth: 16, textAlign: 'right' }}>{keyCount}</span>
        </div>
      </div>
    </div>
  )
}