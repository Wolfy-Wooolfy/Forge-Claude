# Action Game Documentation Draft

## Overview
عايز أبني لعبة Action

## Discovery Summary
- Game Type: Action
- Target Audience: General
- Mode: Offline
- Progression: Levels
- Score System: Yes
- Login: No
- Platform: Android
- Monetization: Ads
- Reference Game: Subway Surfers
- Scope: MVP

## Selected Option
- Option ID: OPTION-1
- Title: Endless Runner MVP
- Description: Offline endless runner game with obstacles, score system, and increasing speed.

## Core Gameplay Mechanics
Player controls a runner character on a forward-moving track.
Player jumps to avoid incoming obstacles.
Obstacles spawn over time and move toward the player.
Game speed increases as score increases.
Collision ends the run.

## Game Loop
1. Start run
2. Spawn player on ground lane
3. Spawn obstacles over time
4. Player jumps to avoid obstacles
5. Update obstacle movement and speed
6. Detect collisions
7. Increase score over time
8. End run on collision or continue

## Player Actions
- Tap, click, or press Space to jump
- Restart run after game over

## Win / Lose Conditions
- Win: MVP has no hard win state; success is measured by survival score
- Lose: Player collides with an obstacle

## UI Structure
- Game Screen with canvas
- Score display
- Speed display
- Status message
- Restart button

## Technical Structure (MVP)
- Frontend: HTML5 Canvas
- Game Logic: JavaScript animation loop
- State Management: In-memory runtime state
- Storage: None for MVP

## MVP Scope
- Single gameplay mode
- Limited levels or controlled MVP session
- Basic UI
- Ads integration placeholder

## Files To Generate
- index.html
- style.css
- game.js

## Execution Boundary
No direct execution is allowed from AI OS. Execution must be handed off to Forge Core only.