import { EnemyConfig, Vector2, GameState } from '../../types/game'

export interface PathNode {
  x: number
  y: number
  f: number
  g: number
  h: number
  parent?: PathNode
}

export class EnemyAI {
  private static instance: EnemyAI
  private tileSize: number = 32
  private canvasWidth: number = 640
  private canvasHeight: number = 512

  static getInstance(): EnemyAI {
    if (!EnemyAI.instance) {
      EnemyAI.instance = new EnemyAI()
    }
    return EnemyAI.instance
  }

  setDimensions(tileSize: number, canvasWidth: number, canvasHeight: number) {
    this.tileSize = tileSize
    this.canvasWidth = canvasWidth
    this.canvasHeight = canvasHeight
  }

  // Simplified direct movement toward player
  moveTowardsPlayer(enemy: EnemyConfig, playerPosition: Vector2, deltaTime: number): Vector2 {
    const dx = playerPosition.x - enemy.position.x
    const dy = playerPosition.y - enemy.position.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance === 0) return enemy.position
    
    // Normalize direction and apply speed
    const moveX = (dx / distance) * enemy.speed * 60 * deltaTime
    const moveY = (dy / distance) * enemy.speed * 60 * deltaTime
    
    return {
      x: enemy.position.x + moveX,
      y: enemy.position.y + moveY
    }
  }

  // A* Pathfinding Algorithm (simplified for better performance)
  findPath(start: Vector2, end: Vector2, map: string[][], enemyType?: string): Vector2[] {
    // For performance, use direct movement if close enough
    const directDistance = this.calculateDistance(start, end)
    if (directDistance < this.tileSize * 3) {
      return [end]
    }

    const startNode: PathNode = {
      x: Math.floor(start.x / this.tileSize),
      y: Math.floor(start.y / this.tileSize),
      f: 0, g: 0, h: 0
    }

    const endNode: PathNode = {
      x: Math.floor(end.x / this.tileSize),
      y: Math.floor(end.y / this.tileSize),
      f: 0, g: 0, h: 0
    }

    const openList: PathNode[] = [startNode]
    const closedList: PathNode[] = []
    let iterations = 0
    const maxIterations = 100 // Prevent infinite loops

    while (openList.length > 0 && iterations < maxIterations) {
      iterations++
      
      // Find node with lowest f cost
      let currentNode = openList[0]
      let currentIndex = 0

      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < currentNode.f) {
          currentNode = openList[i]
          currentIndex = i
        }
      }

      // Move current node from open to closed list
      openList.splice(currentIndex, 1)
      closedList.push(currentNode)

      // Check if we reached the target
      if (currentNode.x === endNode.x && currentNode.y === endNode.y) {
        const path: Vector2[] = []
        let current: PathNode | undefined = currentNode

        while (current) {
          path.unshift({
            x: current.x * this.tileSize + this.tileSize / 2,
            y: current.y * this.tileSize + this.tileSize / 2
          })
          current = current.parent
        }

        return path.slice(1) // Remove starting position
      }

      // Check neighbors (4-directional for simplicity)
      const neighbors = [
        { x: currentNode.x - 1, y: currentNode.y },     // Left
        { x: currentNode.x + 1, y: currentNode.y },     // Right
        { x: currentNode.x, y: currentNode.y - 1 },     // Up
        { x: currentNode.x, y: currentNode.y + 1 }      // Down
      ]

      for (const neighbor of neighbors) {
        // Check bounds
        if (neighbor.x < 0 || neighbor.x >= map[0].length ||
            neighbor.y < 0 || neighbor.y >= map.length) {
          continue
        }
        // Only block walls for non-ghosts
        if (enemyType !== 'ghost' && map[neighbor.y][neighbor.x] === '#') {
          continue
        }

        // Check if neighbor is in closed list
        if (closedList.find(node => node.x === neighbor.x && node.y === neighbor.y)) {
          continue
        }

        // Calculate costs
        const gCost = currentNode.g + 10
        const hCost = this.calculateHeuristic(neighbor, endNode)
        const fCost = gCost + hCost

        // Check if this path to neighbor is better
        const existingNode = openList.find(node => node.x === neighbor.x && node.y === neighbor.y)
        
        if (!existingNode) {
          const newNode: PathNode = {
            x: neighbor.x,
            y: neighbor.y,
            f: fCost,
            g: gCost,
            h: hCost,
            parent: currentNode
          }
          openList.push(newNode)
        } else if (gCost < existingNode.g) {
          existingNode.g = gCost
          existingNode.f = fCost
          existingNode.parent = currentNode
        }
      }
    }

    // No path found, return direct movement
    return [end]
  }

  private calculateHeuristic(a: PathNode, b: PathNode): number {
    // Manhattan distance
    const dx = Math.abs(a.x - b.x)
    const dy = Math.abs(a.y - b.y)
    return 10 * (dx + dy)
  }

  // Simplified Line of Sight Check
  hasLineOfSight(start: Vector2, end: Vector2, map: string[][], enemyType?: string): boolean {
    const dx = Math.abs(end.x - start.x)
    const dy = Math.abs(end.y - start.y)
    const steps = Math.max(dx, dy) / this.tileSize

    if (steps === 0) return true

    const stepX = (end.x - start.x) / steps
    const stepY = (end.y - start.y) / steps

    for (let i = 0; i <= steps; i++) {
      const x = start.x + stepX * i
      const y = start.y + stepY * i
      
      const tileX = Math.floor(x / this.tileSize)
      const tileY = Math.floor(y / this.tileSize)

      if (tileX < 0 || tileX >= map[0].length || 
          tileY < 0 || tileY >= map.length) {
        return false
      }
      // Only block walls for non-ghosts
      if (enemyType !== 'ghost' && map[tileY][tileX] === '#') {
        return false
      }
    }

    return true
  }

  // Calculate rotation angle towards target
  calculateRotation(from: Vector2, to: Vector2): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    return Math.atan2(dy, dx)
  }

  // Update enemy AI state and behavior
  updateEnemyAI(enemy: EnemyConfig, playerPosition: Vector2, gameState: GameState, deltaTime: number): EnemyConfig {
    const distanceToPlayer = this.calculateDistance(enemy.position, playerPosition)
    const hasLOS = this.hasLineOfSight(enemy.position, playerPosition, gameState.level.map, enemy.type)

    switch (enemy.aiType) {
      case 'aggressive':
        return this.updateAggressiveAI(enemy, playerPosition, gameState, deltaTime, distanceToPlayer, hasLOS)
      
      case 'patrol':
        return this.updatePatrolAI(enemy, playerPosition, gameState, deltaTime, distanceToPlayer, hasLOS)
      
      case 'guard':
        return this.updateGuardAI(enemy, playerPosition, gameState, deltaTime, distanceToPlayer, hasLOS)
      
      default:
        return enemy
    }
  }

  private updateAggressiveAI(
    enemy: EnemyConfig, 
    playerPosition: Vector2, 
    gameState: GameState, 
    deltaTime: number,
    distanceToPlayer: number,
    hasLOS: boolean
  ): EnemyConfig {
    const updatedEnemy = { ...enemy }

    // Gauntlet II ghost logic: ghosts move through walls directly toward player
    // Also apply the same logic to grunt enemies
    if (enemy.type === 'ghost' || enemy.type === 'grunt') {
      // Always chase player, ignore walls
      updatedEnemy.aiState = 'chase'
      updatedEnemy.lastSeen = { ...playerPosition }
      updatedEnemy.rotation = this.calculateRotation(enemy.position, playerPosition)
      
      // For grunts, increase speed when they get close to the player (kamikaze behavior)
      let speedMultiplier = 1.0;
      if (enemy.type === 'grunt' && distanceToPlayer < enemy.sightRange * 0.5) {
        // Increase speed by up to 50% as they get closer to the player
        const proximityFactor = 1 - (distanceToPlayer / (enemy.sightRange * 0.5));
        speedMultiplier = 1.0 + (0.5 * proximityFactor);
      }
      
      // Move directly toward player, no collision check
      const tempEnemy = { ...enemy, speed: enemy.speed * speedMultiplier };
      const newPosition = this.moveTowardsPlayer(tempEnemy, playerPosition, deltaTime);
      updatedEnemy.position = newPosition;
      
      const moveVector = this.normalizeVector({
        x: playerPosition.x - enemy.position.x,
        y: playerPosition.y - enemy.position.y
      })
      updatedEnemy.direction = moveVector
      return updatedEnemy
    }

    if (distanceToPlayer <= enemy.sightRange) {
      // Player in sight range - chase mode
      updatedEnemy.aiState = 'chase'
      updatedEnemy.lastSeen = { ...playerPosition }
      
      // Calculate rotation towards player
      updatedEnemy.rotation = this.calculateRotation(enemy.position, playerPosition)
      
      if (distanceToPlayer <= enemy.attackRange) {
        // Close enough to attack
        updatedEnemy.aiState = 'attack'
        return updatedEnemy
      }

      // Move directly towards player for aggressive AI
      const newPosition = this.moveTowardsPlayer(enemy, playerPosition, deltaTime)

      if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
        updatedEnemy.position = newPosition
        const moveVector = this.normalizeVector({
          x: playerPosition.x - enemy.position.x,
          y: playerPosition.y - enemy.position.y
        })
        updatedEnemy.direction = moveVector
      }
    } else if (updatedEnemy.lastSeen && updatedEnemy.aiState === 'chase') {
      // Lost sight but still chasing to last known position
      const distanceToLastSeen = this.calculateDistance(enemy.position, updatedEnemy.lastSeen)
      
      if (distanceToLastSeen < this.tileSize) {
        // Reached last known position, return to idle
        updatedEnemy.aiState = 'idle'
        updatedEnemy.lastSeen = undefined
      } else {
        // Move to last seen position
        const newPosition = this.moveTowardsPlayer(enemy, updatedEnemy.lastSeen, deltaTime)
        if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
          updatedEnemy.position = newPosition
          const moveVector = this.normalizeVector({
            x: updatedEnemy.lastSeen.x - enemy.position.x,
            y: updatedEnemy.lastSeen.y - enemy.position.y
          })
          updatedEnemy.direction = moveVector
          updatedEnemy.rotation = this.calculateRotation(enemy.position, newPosition)
        }
      }
    } else {
      // Idle state - random movement
      updatedEnemy.aiState = 'idle'
      
      if (Math.random() < 0.02) { // 2% chance per frame to change direction
        const randomAngle = Math.random() * Math.PI * 2
        updatedEnemy.direction = {
          x: Math.cos(randomAngle),
          y: Math.sin(randomAngle)
        }
        updatedEnemy.rotation = randomAngle
      }

      // Move in current direction
      const newPosition = {
        x: enemy.position.x + updatedEnemy.direction.x * enemy.speed * 30 * deltaTime,
        y: enemy.position.y + updatedEnemy.direction.y * enemy.speed * 30 * deltaTime
      }

      if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
        updatedEnemy.position = newPosition
      } else {
        // Hit wall, change direction
        const randomAngle = Math.random() * Math.PI * 2
        updatedEnemy.direction = {
          x: Math.cos(randomAngle),
          y: Math.sin(randomAngle)
        }
        updatedEnemy.rotation = randomAngle
      }
    }

    return updatedEnemy
  }

  private updatePatrolAI(
    enemy: EnemyConfig, 
    playerPosition: Vector2, 
    gameState: GameState, 
    deltaTime: number,
    distanceToPlayer: number,
    hasLOS: boolean
  ): EnemyConfig {
    const updatedEnemy = { ...enemy }

    // Check for player first
    if (distanceToPlayer <= enemy.sightRange) {
      updatedEnemy.aiState = 'chase'
      updatedEnemy.lastSeen = { ...playerPosition }
      updatedEnemy.rotation = this.calculateRotation(enemy.position, playerPosition)
      
      // Move towards player
      const newPosition = this.moveTowardsPlayer(enemy, playerPosition, deltaTime)
      if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
        updatedEnemy.position = newPosition
        const moveVector = this.normalizeVector({
          x: playerPosition.x - enemy.position.x,
          y: playerPosition.y - enemy.position.y
        })
        updatedEnemy.direction = moveVector
      }
      return updatedEnemy
    }

    // Initialize patrol points if not set
    if (!updatedEnemy.patrolPoints || updatedEnemy.patrolPoints.length === 0) {
      updatedEnemy.patrolPoints = this.generatePatrolPoints(enemy.position, gameState.level.map)
      updatedEnemy.currentPatrolIndex = 0
    }

    // Patrol behavior
    updatedEnemy.aiState = 'patrol'
    const currentTarget = updatedEnemy.patrolPoints![updatedEnemy.currentPatrolIndex || 0]
    const distanceToTarget = this.calculateDistance(enemy.position, currentTarget)

    if (distanceToTarget < this.tileSize) {
      // Reached patrol point, move to next
      updatedEnemy.currentPatrolIndex = ((updatedEnemy.currentPatrolIndex || 0) + 1) % updatedEnemy.patrolPoints!.length
    } else {
      // Move towards current patrol point
      const newPosition = this.moveTowardsPlayer(enemy, currentTarget, deltaTime * 0.7) // Slower patrol movement
      if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
        updatedEnemy.position = newPosition
        const moveVector = this.normalizeVector({
          x: currentTarget.x - enemy.position.x,
          y: currentTarget.y - enemy.position.y
        })
        updatedEnemy.direction = moveVector
        updatedEnemy.rotation = this.calculateRotation(enemy.position, newPosition)
      }
    }

    return updatedEnemy
  }

  private updateGuardAI(
    enemy: EnemyConfig, 
    playerPosition: Vector2, 
    gameState: GameState, 
    deltaTime: number,
    distanceToPlayer: number,
    hasLOS: boolean
  ): EnemyConfig {
    const updatedEnemy = { ...enemy }

    if (distanceToPlayer <= enemy.sightRange) {
      // Player in range - guard position but face player
      updatedEnemy.aiState = 'attack'
      updatedEnemy.rotation = this.calculateRotation(enemy.position, playerPosition)
      
      // Guards move slowly towards player if they're close
      if (distanceToPlayer > enemy.attackRange && distanceToPlayer < enemy.sightRange * 0.7) {
        const newPosition = this.moveTowardsPlayer(enemy, playerPosition, deltaTime * 0.3) // Very slow movement
        if (enemy.type === 'ghost' || this.isValidPosition(newPosition, gameState)) {
          updatedEnemy.position = newPosition
          const moveVector = this.normalizeVector({
            x: playerPosition.x - enemy.position.x,
            y: playerPosition.y - enemy.position.y
          })
          updatedEnemy.direction = moveVector
        }
      }
    } else {
      // Idle guard behavior - minimal movement
      updatedEnemy.aiState = 'guard'
      
      if (Math.random() < 0.005) { // Very low chance to turn
        const randomAngle = Math.random() * Math.PI * 2
        updatedEnemy.rotation = randomAngle
      }
    }

    return updatedEnemy
  }

  private generatePatrolPoints(startPosition: Vector2, map: string[][]): Vector2[] {
    const points: Vector2[] = []
    const numPoints = 3 + Math.floor(Math.random() * 3) // 3-5 patrol points

    for (let i = 0; i < numPoints; i++) {
      let attempts = 50
      while (attempts > 0) {
        const x = Math.random() * (this.canvasWidth - this.tileSize * 2) + this.tileSize
        const y = Math.random() * (this.canvasHeight - this.tileSize * 2) + this.tileSize
        
        const tileX = Math.floor(x / this.tileSize)
        const tileY = Math.floor(y / this.tileSize)

        if (map[tileY] && map[tileY][tileX] === '.') {
          points.push({ x, y })
          break
        }
        attempts--
      }
    }

    return points.length > 0 ? points : [startPosition]
  }

  private calculateDistance(a: Vector2, b: Vector2): number {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  private normalizeVector(vector: Vector2): Vector2 {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y)
    if (length === 0) return { x: 0, y: 0 }
    return { x: vector.x / length, y: vector.y / length }
  }

  private isValidPosition(position: Vector2, gameState: GameState): boolean {
    // Check bounds
    if (position.x < 0 || position.y < 0 || 
        position.x >= this.canvasWidth - this.tileSize || 
        position.y >= this.canvasHeight - this.tileSize) {
      return false
    }

    // Check tile collision
    const tileX = Math.floor((position.x + this.tileSize / 2) / this.tileSize)
    const tileY = Math.floor((position.y + this.tileSize / 2) / this.tileSize)
    
    if (gameState.level.map[tileY] && gameState.level.map[tileY][tileX] === '#') {
      return false
    }

    return true
  }

  // Check if enemy can attack player
  canAttackPlayer(enemy: EnemyConfig, playerPosition: Vector2): boolean {
    const distance = this.calculateDistance(enemy.position, playerPosition)
    return distance <= enemy.attackRange && enemy.aiState === 'attack'
  }
}