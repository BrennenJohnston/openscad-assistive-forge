# Braille Embosser Roller

Parametric OpenSCAD program for generating braille embossing plates and counter plates for cylindrical objects.

## What This Makes

- **Cylinder Emboss Plate**: Raised braille dots on cylindrical surface
- **Cylinder Counter Plate**: Recessed support for embossing cylindrical objects

## Key Features

- **Text Input**: Pre-translated Unicode braille characters (⠓⠑⠇⠇⠕)
- **Plate Types**: Embossing Plate or Counter Plate
- **Dot Shapes**: Rounded or Cone shaped dots
- **Paper Presets**: 0.4mm, 0.3mm, or Custom thickness
- **Expert Mode**: Full control over dimensions, spacing, and braille parameters

## Quick Start

1. **Translate your text** at https://www.branah.com/braille-translator:
   - Select Grade 1 or Grade 2 braille
   - Ensure "Unicode Braille" output is selected
   - Copy the braille characters

2. **Configure in Customizer**:
   - Paste braille into Line_1, Line_2, etc.
   - Choose plate type (Embossing or Counter)
   - Select paper thickness preset or use Custom
   - Choose dot shape (Rounded or Cone)

3. **Generate STL**: Click "Generate STL" to create your file

## Parameters

### Main Controls
- **Line_1 to Line_4**: Unicode braille text input
- **plate_type**: Embossing Plate or Counter Plate
- **paper_thickness_preset**: 0.4mm, 0.3mm, or Custom

### Expert Mode
- **Dot Shape**: Rounded or Cone
- **Indicators**: Row markers (On/Off)
- **Cylinder Dimensions**: Diameter, height, cutout options
- **Braille Spacing**: Grid layout, cell spacing, positioning
- **Dot Adjustments**: Fine-tune emboss and counter dimensions

## About

This example demonstrates a complex parametric model with:
- Multiple parameter sections and expert mode
- String input fields for Unicode characters
- Extensive customization options
- Professional documentation in comments

Source: Based on the [Braille STL Generator OpenSCAD](https://github.com/BrennenJohnston/braille-stl-generator-openscad) project
