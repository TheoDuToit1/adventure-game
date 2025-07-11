export interface Vector2 {
  x: number
  y: number
}

export interface LevelConfig {
  map: string[][]
  playerStart?: Vector2
  enemies?: EnemyConfig[]
}

export interface EnemyConfig {
  id: string
  type: 'goblin' | 'orc' | 'skeleton' | 'shadow' | 'spider' | 'mm' | 'big_monster' | 'ghost' | 'grunt'
  position: Vector2
  health: number
  maxHealth: number
  speed: number
  damage: number
  size: number
  rotation: number
  direction: Vector2
  aiType: 'aggressive' | 'patrol' | 'guard'
  aiState: 'idle' | 'patrol' | 'chase' | 'attack' | 'return'
  patrolPoints?: Vector2[]
  currentPatrolIndex?: number
  lastSeen?: Vector2
  sightRange: number
  attackRange: number
  color: string
  hitFlash?: number // Timestamp when the enemy was hit, used for flashing effect
  mmData?: {
    name: string
    originalType: string
    imageUrl?: string
  }
}

export interface ChestConfig {
  id: number
  position: Vector2
  isOpen?: boolean
}

export interface FoodPlatterConfig {
  id: number
  position: Vector2
  isEaten?: boolean
}

export interface KeyConfig {
  id: number
  position: Vector2
  isCollected?: boolean
}

export interface DoorConfig {
  id: number
  position: Vector2
  isOpen?: boolean
}

export interface GameState {
  player: {
    position: Vector2
    health: number
    maxHealth: number
    lives?: number
    score: number
    direction: 'north' | 'south' | 'east' | 'west'
    isMoving: boolean
    animation: 'idle' | 'walk' | 'hurt' | 'attack'
    hitFlash?: number // Timestamp when the player was hit, used for flashing effect
  }
  enemies: EnemyConfig[]
  level: LevelConfig
  chests?: ChestConfig[] // Updated to use the ChestConfig interface
  foodPlatters?: FoodPlatterConfig[]
  keys?: KeyConfig[]
  doors?: DoorConfig[]
}

export interface CharacterAnimation {
  id: string
  character: string
  direction: 'north' | 'south' | 'east' | 'west'
  frameCount: number
  spriteUrl: string
  frameWidth: number
  frameHeight: number
}

export interface AnimationFrame {
  image: HTMLImageElement
  frameIndex: number
  totalFrames: number
}

export interface GameProgress {
  currentRoom: 'S1' | 'S3' | 'S2'
  kills: number
  gameWon: boolean
  chestsOpened: Set<number>
  chestContents: Map<number, 'food' | 'poison' | 'potion'>
  potionsCollected: Set<string>
  powerUpActive: boolean
  powerUpEndTime: number | undefined
  playerDead: boolean
  score: number
  powerUpType?: 'health_regen' | 'attack_buff' | 'speed_buff'
  keyCount?: number
}