# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is "Podcast Together" (一起听播客), a real-time podcast listening application that allows friends to listen to podcasts synchronously. It's a full-stack project using Vite + Vue 3 + TypeScript on the frontend and Laf (serverless functions) on the backend.

## Technology Stack

- **Frontend**: Vue 3 + TypeScript + Vite + Vue Router + Pinia
- **Audio Player**: Shikwasa2 (customized podcast player)
- **Backend**: Laf cloud functions (serverless)
- **Styling**: SCSS with custom theme system
- **PWA**: Vite PWA plugin with service worker

## Development Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start development server with hot reload
pnpm dev

# Start development server with force cache clearing
pnpm dev-force

# Build for production (includes TypeScript checking)
pnpm build

# Preview production build locally
pnpm preview

# Start production server (for deployment)
pnpm start
```

## Architecture Overview

### Frontend Structure

The application follows a Vue 3 composition API pattern with the following key directories:

- **`src/views/`**: Main application pages
  - `index-page/`: Landing page
  - `create-page/`: Room creation page  
  - `join-page/`: Join room page with nickname setup
  - `room-page/`: Main listening room with synchronized playback
  - `contact-page/`: Contact information page

- **`src/components/`**: Reusable UI components
  - Custom UI components with theme support
  - Audio loading states and controls

- **`src/hooks/`**: Vue composition functions
  - `useApp.ts`: Main application logic
  - `useTheme.ts`: Dark/light theme management
  - `usePwaDisplayMode.ts`: PWA display mode detection

- **`src/utils/`**: Utility modules organized by purpose
  - `pt-api/`: Platform abstraction layer (storage, device, sharing)
  - `pt-util/`: Application-specific utilities (user data management)
  - `basic/`: Low-level utilities (type checking, validation)
  - `share/`: Social sharing functionality

### Backend Structure

Cloud functions are in `cloud-functions/src/`:

- `room-operate.ts`: Room management (create, join, leave)
- `web-socket.ts`: Real-time synchronization via WebSocket
- `parse-text.ts`: URL parsing for podcast sources
- `pt-service.ts`: General service functions
- `room-clock.ts`: Synchronized playback timing

### Key Features Architecture

1. **Real-time Synchronization**: WebSocket-based room system where one user controls playback and others follow
2. **Theme System**: CSS custom properties with automatic dark/light mode switching
3. **PWA Support**: Service worker for offline capability and app-like experience
4. **Multi-platform Audio**: Supports Xiaoyuzhou (小宇宙) and Apple Podcast links plus direct MP3 URLs
5. **User Management**: Nickname-based system with local storage, no authentication required

### Development Patterns

- **Component Props**: Uses TypeScript interfaces for strict typing
- **State Management**: Pinia stores for global state, local reactive refs for component state  
- **Routing**: Vue Router with navigation guards for nickname validation
- **Styling**: SCSS with CSS custom properties for theming, component-scoped styles
- **API Layer**: Abstracted through `src/request/api.ts` with environment-based URLs

### Environment Configuration

The app uses `PT_ENV` global variable defined in `vite.config.ts`:
- `version`: From package.json
- `client`: Always "web" for browser builds

### Theme Implementation

Dual theme system with CSS custom properties:
- Light theme: `.classic-theme`
- Dark theme: `.dark-theme`
- Theme persistence via local storage
- Automatic system preference detection

### Audio Player Integration

Uses customized Shikwasa2 player with:
- Synchronized playback controls
- Room-wide play/pause/seek synchronization
- Loading states and error handling
- Mobile-optimized controls

## File Naming Conventions

- Vue components: `kebab-case.vue` (e.g., `room-page.vue`)
- TypeScript files: `kebab-case.ts` (e.g., `pt-util.ts`)
- Directories: `kebab-case` (e.g., `room-page/`)
- Utility prefixes: `pt-` for project-specific utilities

## Important Notes

- Node.js version requirement: `>=20 <23`
- The app expects environment variables for API URLs (check `.env.template`)
- Cloud functions are designed for Laf serverless platform
- PWA manifest is disabled in vite config (uses custom implementation)
- Uses `@/` alias for `src/` directory imports
- Keep-alive is enabled for all main routes for performance