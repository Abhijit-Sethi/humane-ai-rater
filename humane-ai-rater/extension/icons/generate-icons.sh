#!/bin/bash
# Run this script with: bash generate-icons.sh
# Requires ImageMagick: brew install imagemagick

# Create a simple green circle with leaf emoji as placeholder
# For production, use a proper icon design tool

# Create 16x16 icon
convert -size 16x16 xc:"#2D5A27" -fill white -gravity center \
  -font Arial -pointsize 10 -annotate 0 "🌱" icon16.png 2>/dev/null || \
  echo "ImageMagick not installed. Please create PNG icons manually."

# Create 48x48 icon  
convert -size 48x48 xc:"#2D5A27" -fill white -gravity center \
  -font Arial -pointsize 28 -annotate 0 "🌱" icon48.png 2>/dev/null

# Create 128x128 icon
convert -size 128x128 xc:"#2D5A27" -fill white -gravity center \
  -font Arial -pointsize 72 -annotate 0 "🌱" icon128.png 2>/dev/null

echo "Icons generated (or use manual creation if ImageMagick unavailable)"
