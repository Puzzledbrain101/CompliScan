# Compliance Dashboard Application

## Overview
This is a compliance dashboard application imported from GitHub that helps with Legal Metrology compliance checks. The application consists of a React/Vite frontend and Express.js backend that supports web scraping, OCR parsing (mocked), and rule engine compliance checking.

## Current State
- ✅ Successfully imported and configured for Replit environment
- ✅ Both frontend and backend running successfully
- ✅ Frontend on port 5000 (user-facing)  
- ✅ Backend on port 8000 (internal API)
- ✅ Deployment configuration complete
- ⚠️ OpenAI API key not configured (AI features disabled)

## Project Architecture

### Frontend (React + Vite)
- **Location**: `/frontend/`
- **Port**: 5000 (configured for Replit proxy)
- **Host**: 0.0.0.0 with allowedHosts: true
- **Build**: `npm run build` creates production build
- **Features**: File upload interface, URL input, dashboard UI

### Backend (Express.js)
- **Location**: `/backend/`  
- **Port**: 8000 (internal, proxied by frontend)
- **Host**: localhost
- **Features**: 
  - Web scraping (Flipkart, Amazon, Myntra, Nykaa support)
  - File upload handling (images)
  - OCR processing (mocked)
  - Compliance rule engine
  - Rate limiting and security headers
  - AI-powered analysis (requires OpenAI API key)

## Recent Changes
- **Date**: September 14, 2025
- **Changes Made**:
  - Imported project from GitHub zip file
  - Installed Node.js 20 and all dependencies  
  - Modified backend to use localhost instead of 0.0.0.0
  - Made OpenAI initialization conditional (optional API key)
  - Created startup script to run both services
  - Configured workflow for port 5000 web preview
  - Set up deployment configuration for autoscale
  - Added comprehensive .gitignore for Node.js projects

## Configuration Files

### Key Files
- `start-dev.sh`: Development startup script (runs both services)
- `frontend/vite.config.js`: Frontend configuration with proxy to backend
- `backend/server.js`: Backend server with API endpoints
- `.gitignore`: Node.js project exclusions

### Environment Variables (Optional)
- `OPENAI_API_KEY`: Enables AI-powered compliance explanations and data normalization
- `NODE_ENV`: Set to 'production' for production deployment

## API Endpoints
- `GET /health`: Backend health check
- `POST /api/check`: Main compliance checking endpoint
  - Accepts: multipart form data (image) or JSON body (url)
  - Returns: compliance analysis results

## User Preferences
- Application is ready to use without additional configuration
- OpenAI features can be enabled by adding API key if needed
- Frontend uses modern React with Vite for fast development

## Deployment
- **Target**: Autoscale (stateless web application)
- **Build**: Frontend builds to `frontend/dist/`
- **Run**: Both backend and frontend services in production mode
- **Status**: Ready for deployment