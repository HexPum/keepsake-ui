#!/bin/bash
# Keepsake Docker development stack starter
# This script simplifies running the entire dev environment with Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.dev.yml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    print_error "Docker daemon is not running. Please start Docker and try again."
    exit 1
fi

print_success "Docker is installed and running"

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

print_success "Docker Compose is installed"

# Create .env file if it doesn't exist
ENV_FILE="$SCRIPT_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    print_info "Creating .env file with defaults..."
    cat > "$ENV_FILE" << 'EOF'
# Keepsake Development Environment Variables
# Customize these as needed

# Database directory (mounted to /data in container)
# DATA_DIR=/custom/path/to/data

# Meilisearch configuration
# MEILI_MASTER_KEY=your-master-key

# NextAuth configuration
# NEXTAUTH_URL=http://localhost:3000
# NEXTAUTH_SECRET=super-secure-nextauth-secret

# Service addresses
# MEILI_ADDR=http://meilisearch:7700
# BROWSER_WEB_URL=http://chrome:9222
EOF
    print_success ".env file created at $ENV_FILE"
fi

# Parse command line arguments
COMMAND="${1:-up}"
FOLLOW_LOGS="${2:-}"

case "$COMMAND" in
    "up"|"start")
        print_header "Starting Keepsake Development Stack"
        echo ""
        echo "Available services:"
        echo "  - Web app (Next.js):      http://localhost:3000"
        echo "  - Mobile app (Expo):      http://localhost:8081 or http://localhost:19000"
        echo "  - Meilisearch (search):   http://localhost:7700"
        echo "  - Chrome (headless):      http://127.0.0.1:9222 (internal)"
        echo ""
        print_info "First startup may take 5-10 minutes (installing dependencies, running migrations)"
        echo ""

        if [ "$FOLLOW_LOGS" = "-f" ] || [ "$FOLLOW_LOGS" = "--follow" ]; then
            docker-compose -f "$COMPOSE_FILE" up
        else
            docker-compose -f "$COMPOSE_FILE" up -d
            print_success "Services started in background"
            print_info "View logs with: docker-compose -f $COMPOSE_FILE logs -f"
            echo ""
            # Wait a bit and check if services are healthy
            sleep 3
            docker-compose -f "$COMPOSE_FILE" ps
        fi
        ;;

    "down"|"stop")
        print_header "Stopping Keepsake Development Stack"
        docker-compose -f "$COMPOSE_FILE" down
        print_success "Services stopped"
        ;;

    "restart")
        print_header "Restarting Keepsake Development Stack"
        docker-compose -f "$COMPOSE_FILE" restart
        print_success "Services restarted"
        ;;

    "rebuild")
        print_header "Rebuilding Keepsake Development Stack"
        docker-compose -f "$COMPOSE_FILE" down
        docker-compose -f "$COMPOSE_FILE" up --build -d
        print_success "Services rebuilt and started"
        ;;

    "clean")
        print_header "Cleaning Keepsake Development Stack"
        print_warning "This will delete all volumes and data!"
        read -p "Are you sure? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose -f "$COMPOSE_FILE" down -v
            print_success "All services and volumes cleaned"
        else
            print_info "Clean cancelled"
        fi
        ;;

    "logs")
        SERVICE="${2:-}"
        if [ -z "$SERVICE" ]; then
            docker-compose -f "$COMPOSE_FILE" logs -f
        else
            docker-compose -f "$COMPOSE_FILE" logs -f "$SERVICE"
        fi
        ;;

    "status"|"ps")
        docker-compose -f "$COMPOSE_FILE" ps
        ;;

    "shell")
        SERVICE="${2:-web}"
        print_info "Opening shell in $SERVICE service..."
        docker-compose -f "$COMPOSE_FILE" exec "$SERVICE" sh
        ;;

    "help"|"--help"|"-h")
        print_header "Keepsake Docker Development Stack"
        echo ""
        echo "Usage: ./start-dev.sh [COMMAND] [OPTIONS]"
        echo ""
        echo "Commands:"
        echo "  up                 Start all services in background"
        echo "  up -f              Start all services and follow logs"
        echo "  down               Stop all services"
        echo "  restart            Restart all services"
        echo "  rebuild            Rebuild and restart all services"
        echo "  clean              Remove all services and volumes (destructive!)"
        echo "  logs [SERVICE]     View logs (all services or specific one)"
        echo "  status             Show service status"
        echo "  ps                 Alias for 'status'"
        echo "  shell [SERVICE]    Open shell in a service (default: web)"
        echo "  help               Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./start-dev.sh up                    # Start in background"
        echo "  ./start-dev.sh up -f                 # Start and follow logs"
        echo "  ./start-dev.sh logs mobile           # View mobile app logs"
        echo "  ./start-dev.sh shell mobile          # Shell into mobile service"
        echo "  ./start-dev.sh down                  # Stop everything"
        echo ""
        echo "Default URLs:"
        echo "  Web:        http://localhost:3000"
        echo "  Mobile:     http://localhost:8081 or http://localhost:19000"
        echo "  Meilisearch: http://localhost:7700"
        echo ""
        echo "For more information, see docker/README_DOCKER.md"
        echo ""
        ;;

    *)
        print_error "Unknown command: $COMMAND"
        echo "Use './start-dev.sh help' for available commands"
        exit 1
        ;;
esac
