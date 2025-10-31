#!/bin/bash

# BifrostLink - Push Docker Images to Google Artifact Registry (GAR)
# This script builds and pushes all Docker images to GCP Artifact Registry

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE VALUES
PROJECT_ID="${GCP_PROJECT_ID:-your-gcp-project-id}"
REGION="${GAR_REGION:-asia-south1}"  # Mumbai region
REPOSITORY="${GAR_REPOSITORY:-bifrostlink}"
SERVICE_ACCOUNT_KEY="${SERVICE_ACCOUNT_KEY:-./serviceaccount.json}"

# Image names and versions
VERSION="${IMAGE_VERSION:-latest}"
GATEWAY_IMAGE="gateway"
API_SERVER_IMAGE="api-server"
FRONTEND_IMAGE="frontend"
AGENT_IMAGE="agent"

# Construct full image paths
GAR_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if gcloud is installed
check_gcloud() {
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first:"
        echo "https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    print_success "gcloud CLI found"
}

# Function to check if docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        exit 1
    fi
    print_success "Docker found"
}

# Function to validate configuration
validate_config() {
    print_info "Validating configuration..."

    # Check if service account file exists
    if [ ! -f "$SERVICE_ACCOUNT_KEY" ]; then
        print_error "Service account key file not found: ${SERVICE_ACCOUNT_KEY}"
        echo "Please ensure serviceaccount.json exists in the project root"
        echo "Or set SERVICE_ACCOUNT_KEY environment variable"
        exit 1
    fi

    print_success "Service account key found: ${SERVICE_ACCOUNT_KEY}"

    # Extract project ID from service account if not set
    if [ "$PROJECT_ID" = "your-gcp-project-id" ]; then
        print_info "Extracting project ID from service account key..."
        PROJECT_ID=$(grep -o '"project_id": *"[^"]*"' "$SERVICE_ACCOUNT_KEY" | sed 's/"project_id": *"\(.*\)"/\1/')

        if [ -z "$PROJECT_ID" ]; then
            print_error "Could not extract project_id from service account key"
            echo "Please set GCP_PROJECT_ID environment variable"
            exit 1
        fi

        print_success "Extracted project ID: ${PROJECT_ID}"
        # Update GAR_BASE with extracted project ID
        GAR_BASE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}"
    fi

    print_success "Configuration validated"
    echo ""
    echo "Configuration:"
    echo "  Project ID:      ${PROJECT_ID}"
    echo "  Region:          ${REGION} (Mumbai)"
    echo "  Repository:      ${REPOSITORY}"
    echo "  Version:         ${VERSION}"
    echo "  Service Account: ${SERVICE_ACCOUNT_KEY}"
    echo "  GAR Base:        ${GAR_BASE}"
    echo ""
}

# Function to authenticate with GCP using service account
authenticate() {
    print_info "Authenticating with GCP using service account..."

    # Activate service account
    print_info "Activating service account from ${SERVICE_ACCOUNT_KEY}..."
    gcloud auth activate-service-account --key-file="${SERVICE_ACCOUNT_KEY}"

    if [ $? -ne 0 ]; then
        print_error "Failed to activate service account"
        exit 1
    fi

    print_success "Service account activated successfully"

    # Set project
    print_info "Setting active project to ${PROJECT_ID}..."
    gcloud config set project "${PROJECT_ID}"

    # Verify authentication
    ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
    print_success "Authenticated as: ${ACTIVE_ACCOUNT}"
}

# Function to enable required APIs
enable_apis() {
    print_info "Checking and enabling required GCP APIs..."

    # Check if API is already enabled
    if gcloud services list --enabled --project="${PROJECT_ID}" 2>/dev/null | grep -q "artifactregistry.googleapis.com"; then
        print_success "Artifact Registry API is already enabled"
        return 0
    fi

    # Enable Artifact Registry API
    print_info "Enabling Artifact Registry API..."
    gcloud services enable artifactregistry.googleapis.com --project="${PROJECT_ID}" 2>&1

    if [ $? -eq 0 ]; then
        print_success "Artifact Registry API enabled"
        print_info "Waiting 15 seconds for API to propagate..."
        sleep 15
    else
        print_error "Failed to enable Artifact Registry API"
        echo ""
        print_warning "Common issues:"
        echo "  1. Billing not enabled - Enable billing at: https://console.cloud.google.com/billing"
        echo "  2. Service account lacks permissions - Required: roles/serviceusage.serviceUsageAdmin"
        echo "  3. API already enabled - Try continuing manually"
        echo ""
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_error "Aborting..."
            exit 1
        fi
        print_warning "Continuing despite API enable failure..."
    fi
}

# Function to configure Docker for GAR
configure_docker() {
    print_info "Configuring Docker authentication for GAR..."
    gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
    print_success "Docker authentication configured"
}

# Function to create GAR repository if it doesn't exist
create_repository() {
    print_info "Checking if repository '${REPOSITORY}' exists..."

    if gcloud artifacts repositories describe "${REPOSITORY}" \
        --location="${REGION}" \
        --project="${PROJECT_ID}" &> /dev/null; then
        print_success "Repository '${REPOSITORY}' already exists"
    else
        print_warning "Repository '${REPOSITORY}' not found. Creating..."
        gcloud artifacts repositories create "${REPOSITORY}" \
            --repository-format=docker \
            --location="${REGION}" \
            --description="BifrostLink Docker images" \
            --project="${PROJECT_ID}"
        print_success "Repository '${REPOSITORY}' created"
    fi
}

# Function to build and push an image
build_and_push() {
    local service=$1
    local dockerfile=$2
    local context=$3
    local image_name="${GAR_BASE}/${service}:${VERSION}"
    local latest_tag="${GAR_BASE}/${service}:latest"

    print_info "========================================="
    print_info "Building ${service}..."
    print_info "========================================="

    # Build the image
    docker build \
        -f "${dockerfile}" \
        -t "${image_name}" \
        -t "${latest_tag}" \
        "${context}"

    print_success "${service} built successfully"

    # Push the versioned tag
    print_info "Pushing ${service}:${VERSION}..."
    docker push "${image_name}"
    print_success "${service}:${VERSION} pushed successfully"

    # Push the latest tag
    print_info "Pushing ${service}:latest..."
    docker push "${latest_tag}"
    print_success "${service}:latest pushed successfully"

    echo ""
}

# Function to display final summary
display_summary() {
    print_success "========================================="
    print_success "All images pushed successfully!"
    print_success "========================================="
    echo ""
    echo "Pushed images:"
    echo "  1. ${GAR_BASE}/${GATEWAY_IMAGE}:${VERSION}"
    echo "  2. ${GAR_BASE}/${API_SERVER_IMAGE}:${VERSION}"
    echo "  3. ${GAR_BASE}/${FRONTEND_IMAGE}:${VERSION}"
    echo "  4. ${GAR_BASE}/${AGENT_IMAGE}:${VERSION}"
    echo ""
    echo "All images also tagged with 'latest'"
    echo ""
    echo "To pull these images:"
    echo "  docker pull ${GAR_BASE}/${GATEWAY_IMAGE}:${VERSION}"
    echo ""
    echo "To view in GAR:"
    echo "  https://console.cloud.google.com/artifacts/docker/${PROJECT_ID}/${REGION}/${REPOSITORY}"
}

# Main execution
main() {
    echo ""
    print_info "========================================="
    print_info "BifrostLink - Push to GAR"
    print_info "========================================="
    echo ""

    # Pre-flight checks
    check_gcloud
    check_docker
    validate_config

    # Setup
    authenticate
    enable_apis
    configure_docker
    create_repository

    echo ""
    print_info "Starting build and push process..."
    echo ""

    # Build and push all images
    build_and_push "${GATEWAY_IMAGE}" "gateway/Dockerfile" "."
    build_and_push "${API_SERVER_IMAGE}" "api-server/Dockerfile" "."
    build_and_push "${AGENT_IMAGE}" "agent/Dockerfile" "."
    build_and_push "${FRONTEND_IMAGE}" "frontend/Dockerfile" "./frontend"

    # Display summary
    display_summary
}

# Run main function
main "$@"
