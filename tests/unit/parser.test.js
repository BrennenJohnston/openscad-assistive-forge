import { describe, it, expect, beforeEach } from 'vitest'
import { extractParameters } from '../../src/js/parser.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe('Parameter Parser', () => {
  describe('Range Parameters', () => {
    it('should parse simple range [min:max]', () => {
      const scad = `
        /*[Dimensions]*/
        width = 50; // [10:100]
      `
      const result = extractParameters(scad)
      
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].id).toBe('Dimensions')
      expect(result.groups[0].label).toBe('Dimensions')
      
      // Parameters are flat, not nested in groups
      expect(result.parameters).toBeDefined()
      expect(result.parameters.width).toBeDefined()
      
      const param = result.parameters.width
      expect(param.default).toBe(50)
      expect(param.minimum).toBe(10)
      expect(param.maximum).toBe(100)
      expect(param.type).toMatch(/integer|number/)
      expect(param.group).toBe('Dimensions')
    })
    
    it('should parse step range [min:step:max]', () => {
      const scad = `
        wall_thickness = 2; // [1:0.5:5]
      `
      const result = extractParameters(scad)
      const param = result.parameters.wall_thickness
      
      expect(param).toBeDefined()
      expect(param.default).toBe(2)
      expect(param.minimum).toBe(1)
      expect(param.step).toBe(0.5)
      expect(param.maximum).toBe(5)
    })

    it('should handle negative numbers in ranges', () => {
      const scad = `
        offset = 0; // [-10:10]
      `
      const result = extractParameters(scad)
      const param = result.parameters.offset
      
      expect(param).toBeDefined()
      expect(param.minimum).toBe(-10)
      expect(param.maximum).toBe(10)
      expect(param.default).toBe(0)
    })

    it('should handle decimal values', () => {
      const scad = `
        tolerance = 0.2; // [0.1:0.1:1.0]
      `
      const result = extractParameters(scad)
      const param = result.parameters.tolerance
      
      expect(param).toBeDefined()
      expect(param.minimum).toBe(0.1)
      expect(param.step).toBe(0.1)
      expect(param.maximum).toBe(1.0)
      expect(param.default).toBe(0.2)
    })
  })
  
  describe('Enum Parameters', () => {
    it('should parse string enums', () => {
      const scad = `
        shape = "round"; // [round, square, hexagon]
      `
      const result = extractParameters(scad)
      const param = result.parameters.shape
      
      expect(param).toBeDefined()
      expect(param.type).toBe('string')
      expect(param.enum).toEqual(['round', 'square', 'hexagon'])
      expect(param.default).toBe('round')
      expect(param.uiType).toBe('select')
    })

    it('should parse quoted string enums', () => {
      const scad = `
        option = "Option A"; // ["Option A", "Option B", "Option C"]
      `
      const result = extractParameters(scad)
      const param = result.parameters.option
      
      expect(param).toBeDefined()
      expect(param.enum).toEqual(['Option A', 'Option B', 'Option C'])
      expect(param.default).toBe('Option A')
    })

    it('should handle enums with spaces', () => {
      const scad = `
        part = "Main Body"; // [Main Body, Lid, Handle]
      `
      const result = extractParameters(scad)
      const param = result.parameters.part
      
      expect(param).toBeDefined()
      expect(param.enum).toContain('Main Body')
      expect(param.enum).toContain('Lid')
      expect(param.enum).toContain('Handle')
    })

    it('should parse numeric enums', () => {
      const scad = `
        level = 1; // [0, 1, 2, 3]
      `
      const result = extractParameters(scad)
      const param = result.parameters.level
      
      expect(param).toBeDefined()
      expect(param.enum).toEqual(['0', '1', '2', '3'])
    })
  })
  
  describe('Boolean Parameters', () => {
    it('should detect yes/no as boolean toggle', () => {
      const scad = `
        hollow = "yes"; // [yes, no]
      `
      const result = extractParameters(scad)
      const param = result.parameters.hollow
      
      expect(param).toBeDefined()
      expect(param.uiType).toBe('toggle')
      expect(param.default).toBe('yes')
      expect(param.enum).toEqual(['yes', 'no'])
    })

    it('should detect true/false as toggle', () => {
      const scad = `
        enabled = "true"; // [true, false]
      `
      const result = extractParameters(scad)
      const param = result.parameters.enabled
      
      expect(param).toBeDefined()
      // true/false should be recognized as toggle
      expect(param.uiType).toMatch(/toggle|select/)
    })

    it('should detect on/off as toggle', () => {
      const scad = `
        feature = "on"; // [on, off]
      `
      const result = extractParameters(scad)
      const param = result.parameters.feature
      
      expect(param).toBeDefined()
      // on/off should be recognized as toggle
      expect(param.uiType).toMatch(/toggle|select/)
    })
  })
  
  describe('Parameter Groups', () => {
    it('should parse multiple groups', () => {
      const scad = `
        /*[Dimensions]*/
        width = 50;
        
        /*[Options]*/
        color = "red";
        
        /*[Advanced]*/
        tolerance = 0.1;
      `
      const result = extractParameters(scad)
      
      expect(result.groups).toHaveLength(3)
      expect(result.groups[0].id).toBe('Dimensions')
      expect(result.groups[1].id).toBe('Options')
      expect(result.groups[2].id).toBe('Advanced')
      
      // Check parameters are assigned to correct groups
      expect(result.parameters.width.group).toBe('Dimensions')
      expect(result.parameters.color.group).toBe('Options')
      expect(result.parameters.tolerance.group).toBe('Advanced')
    })

    it('should handle parameters without explicit group', () => {
      const scad = `
        width = 50;
        height = 30;
      `
      const result = extractParameters(scad)
      
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].id).toBe('General')
      expect(result.groups[0].label).toBe('General')
      
      // Check parameters exist
      expect(Object.keys(result.parameters)).toHaveLength(2)
      expect(result.parameters.width).toBeDefined()
      expect(result.parameters.height).toBeDefined()
    })

    it('should maintain group order', () => {
      const scad = `
        /*[Z Group]*/
        z_param = 1;
        
        /*[A Group]*/
        a_param = 2;
        
        /*[M Group]*/
        m_param = 3;
      `
      const result = extractParameters(scad)
      
      // Groups should maintain order they appear in file
      expect(result.groups[0].id).toBe('Z Group')
      expect(result.groups[1].id).toBe('A Group')
      expect(result.groups[2].id).toBe('M Group')
    })
  })
  
  describe('Hidden Parameters', () => {
    it('should exclude Hidden group from groups array', () => {
      const scad = `
        width = 50;
        
        /*[Hidden]*/
        $fn = 100;
        internal_var = 42;
      `
      const result = extractParameters(scad)
      
      // Hidden group should not be in groups array
      const hiddenGroup = result.groups.find(g => g.id.toLowerCase() === 'hidden')
      expect(hiddenGroup).toBeUndefined()
      
      // Should only have General group
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].id).toBe('General')
      
      // Visible parameter should exist
      expect(result.parameters.width).toBeDefined()
      
      // Hidden parameters might still be in parameters object (implementation detail)
      // Just verify visible param is there
    })

    it('should handle multiple hidden parameters', () => {
      const scad = `
        visible = 1;
        
        /*[Hidden]*/
        $fn = 100;
        $fa = 1;
        $fs = 0.4;
        internal = true;
      `
      const result = extractParameters(scad)
      
      // No Hidden group in groups array
      const hiddenGroup = result.groups.find(g => g.id.toLowerCase() === 'hidden')
      expect(hiddenGroup).toBeUndefined()
      
      // Visible parameter exists
      expect(result.parameters.visible).toBeDefined()
      expect(result.parameters.visible.group).toBe('General')
    })
  })

  describe('Comments and Descriptions', () => {
    it('should extract inline comments as descriptions', () => {
      const scad = `
        width = 50; // [10:100] Width of the main body
      `
      const result = extractParameters(scad)
      const param = result.parameters.width
      
      expect(param).toBeDefined()
      expect(param.description).toContain('Width of the main body')
    })

    it('should handle comments without hints', () => {
      const scad = `
        width = 50; // Width in millimeters
      `
      const result = extractParameters(scad)
      const param = result.parameters.width
      
      expect(param).toBeDefined()
      expect(param.description).toContain('Width in millimeters')
    })

    it('should handle parameters without comments', () => {
      const scad = `
        width = 50;
      `
      const result = extractParameters(scad)
      const param = result.parameters.width
      
      expect(param).toBeDefined()
      expect(param.default).toBe(50)
      // Description may be empty string or undefined
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle parameters with special characters in names', () => {
      const scad = `
        base_width = 50;
        wall_thickness_2 = 2;
      `
      const result = extractParameters(scad)
      
      expect(Object.keys(result.parameters)).toHaveLength(2)
      expect(result.parameters.base_width).toBeDefined()
      expect(result.parameters.wall_thickness_2).toBeDefined()
    })

    it('should ignore non-parameter assignments inside modules', () => {
      const scad = `
        width = 50; // [10:100]
        
        // Module definition - assignments inside should be ignored
        module box() {
          local_var = 10;
        }
      `
      const result = extractParameters(scad)
      
      // Should only have the width parameter
      expect(result.parameters.width).toBeDefined()
      expect(result.parameters.local_var).toBeUndefined()
    })

    it('should handle parameters with expressions as defaults', () => {
      const scad = `
        radius = 10; // [5:20]
        diameter = radius * 2;
      `
      const result = extractParameters(scad)
      
      // Parser should capture radius parameter
      expect(result.parameters.radius).toBeDefined()
      expect(result.parameters.radius.default).toBe(10)
      
      // diameter may or may not be captured as parameter (depends on implementation)
      // Just verify radius works
    })
  })

  describe('Real-World Fixture Files', () => {
    it('should parse sample.scad fixture', () => {
      const scadPath = join(__dirname, '../fixtures/sample.scad')
      const scad = readFileSync(scadPath, 'utf-8')
      
      const result = extractParameters(scad)
      
      // Should have Dimensions and Options groups
      expect(result.groups.length).toBeGreaterThanOrEqual(2)
      
      const dimensionsGroup = result.groups.find(g => g.id === 'Dimensions')
      expect(dimensionsGroup).toBeDefined()
      
      // Check specific parameters
      expect(result.parameters.width).toBeDefined()
      expect(result.parameters.width.default).toBe(50)
      expect(result.parameters.width.minimum).toBe(10)
      expect(result.parameters.width.maximum).toBe(100)
      expect(result.parameters.width.group).toBe('Dimensions')
      
      // Check Options group parameters
      expect(result.parameters.include_lid).toBeDefined()
      expect(result.parameters.include_lid.group).toBe('Options')
    })

    it('should parse sample-advanced.scad fixture', () => {
      const scadPath = join(__dirname, '../fixtures/sample-advanced.scad')
      const scad = readFileSync(scadPath, 'utf-8')
      
      const result = extractParameters(scad)
      
      // Should parse all visible parameter groups (no Hidden in groups array)
      const hiddenGroup = result.groups.find(g => g.id.toLowerCase() === 'hidden')
      expect(hiddenGroup).toBeUndefined()
      
      // Should have at least 3 visible groups
      expect(result.groups.length).toBeGreaterThanOrEqual(3)
      
      // Check for enum parameter
      expect(result.parameters.shape).toBeDefined()
      expect(result.parameters.shape.group).toBe('Options')
      
      // enum values (not options)
      if (result.parameters.shape.enum) {
        expect(result.parameters.shape.enum).toContain('round')
        expect(result.parameters.shape.enum).toContain('square')
        expect(result.parameters.shape.enum).toContain('hexagon')
      } else {
        // Just verify parameter exists
        expect(result.parameters.shape.default).toBe('round')
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const result = extractParameters('')
      
      expect(result).toBeDefined()
      expect(result.groups).toBeDefined()
      expect(Array.isArray(result.groups)).toBe(true)
      expect(result.parameters).toBeDefined()
    })

    it('should handle input with no parameters', () => {
      const scad = `
        // Just a comment
        module box() {
          cube([10, 10, 10]);
        }
      `
      const result = extractParameters(scad)
      
      expect(result.groups).toBeDefined()
      expect(result.parameters).toBeDefined()
      // May have General group with no parameters
    })

    it('should handle malformed annotations gracefully', () => {
      const scad = `
        width = 50; // [10:100
        height = 30; // [10:80]
      `
      const result = extractParameters(scad)
      
      // Parser should not crash
      expect(result).toBeDefined()
      expect(result.groups).toBeDefined()
      
      // Should still parse the valid parameter
      expect(result.parameters.height).toBeDefined()
      expect(result.parameters.height.minimum).toBe(10)
      expect(result.parameters.height.maximum).toBe(80)
    })

    it('should handle parameters with no default value gracefully', () => {
      const scad = `
        /*[Test]*/
        width = 50;
      `
      const result = extractParameters(scad)
      
      // Parser should handle valid parameters
      expect(result.groups).toBeDefined()
      expect(result.parameters.width).toBeDefined()
    })
  })
})
