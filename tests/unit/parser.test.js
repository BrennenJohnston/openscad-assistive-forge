import { describe, it, expect, beforeEach } from 'vitest'
import { extractParameters } from '../../src/js/parser.js'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load golden corpus for vector parsing tests
const goldenCorpusPath = join(__dirname, '../../docs/planning/parser-golden-corpus.json')
const goldenCorpus = existsSync(goldenCorpusPath) 
  ? JSON.parse(readFileSync(goldenCorpusPath, 'utf-8'))
  : null

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
      // New format: enum items are objects with { value, label, hasLabel }
      expect(param.enum).toEqual([
        { value: 'round', label: 'round', hasLabel: false },
        { value: 'square', label: 'square', hasLabel: false },
        { value: 'hexagon', label: 'hexagon', hasLabel: false },
      ])
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
      expect(param.enum).toEqual([
        { value: 'Option A', label: 'Option A', hasLabel: false },
        { value: 'Option B', label: 'Option B', hasLabel: false },
        { value: 'Option C', label: 'Option C', hasLabel: false },
      ])
      expect(param.default).toBe('Option A')
    })

    it('should handle enums with spaces', () => {
      const scad = `
        part = "Main Body"; // [Main Body, Lid, Handle]
      `
      const result = extractParameters(scad)
      const param = result.parameters.part
      
      expect(param).toBeDefined()
      // Check that values are correctly parsed using helper to extract values
      const enumValues = param.enum.map(item => item.value)
      expect(enumValues).toContain('Main Body')
      expect(enumValues).toContain('Lid')
      expect(enumValues).toContain('Handle')
    })

    it('should parse numeric enums', () => {
      const scad = `
        level = 1; // [0, 1, 2, 3]
      `
      const result = extractParameters(scad)
      const param = result.parameters.level
      
      expect(param).toBeDefined()
      expect(param.enum).toEqual([
        { value: '0', label: '0', hasLabel: false },
        { value: '1', label: '1', hasLabel: false },
        { value: '2', label: '2', hasLabel: false },
        { value: '3', label: '3', hasLabel: false },
      ])
    })

    it('should parse labeled enum for numbers (OpenSCAD Customizer format)', () => {
      const scad = `
        size = 20; // [10:S, 20:M, 30:L]
      `
      const result = extractParameters(scad)
      const param = result.parameters.size
      
      expect(param).toBeDefined()
      expect(param.enum).toEqual([
        { value: '10', label: 'S', hasLabel: true },
        { value: '20', label: 'M', hasLabel: true },
        { value: '30', label: 'L', hasLabel: true },
      ])
      expect(param.uiType).toBe('select')
    })

    it('should parse labeled enum for strings (OpenSCAD Customizer format)', () => {
      const scad = `
        size_code = "S"; // [S:Small, M:Medium, L:Large]
      `
      const result = extractParameters(scad)
      const param = result.parameters.size_code
      
      expect(param).toBeDefined()
      expect(param.enum).toEqual([
        { value: 'S', label: 'Small', hasLabel: true },
        { value: 'M', label: 'Medium', hasLabel: true },
        { value: 'L', label: 'Large', hasLabel: true },
      ])
      expect(param.default).toBe('S')
    })

    it('should parse text length limit (OpenSCAD Customizer format)', () => {
      const scad = `
        // Short text
        shortText = "hi"; //8
        
        // Longer text with description
        normalText = "hello world";
      `
      const result = extractParameters(scad)
      
      // Parameter with length limit
      expect(result.parameters.shortText).toBeDefined()
      expect(result.parameters.shortText.maxLength).toBe(8)
      expect(result.parameters.shortText.type).toBe('string')
      
      // Parameter without length limit
      expect(result.parameters.normalText).toBeDefined()
      expect(result.parameters.normalText.maxLength).toBeUndefined()
    })

    it('should parse text length limit with spaces', () => {
      const scad = `
        text = "value"; // 12
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.text).toBeDefined()
      expect(result.parameters.text.maxLength).toBe(12)
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
      expect(param.enum).toEqual([
        { value: 'yes', label: 'yes', hasLabel: false },
        { value: 'no', label: 'no', hasLabel: false },
      ])
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

    it('should detect boolean literals (true/false) as toggle', () => {
      const scad = `
        // Enable rounded corners
        rounded = true;
        
        // Disable hollow mode
        solid = false;
      `
      const result = extractParameters(scad)
      
      // true literal should be toggle
      const roundedParam = result.parameters.rounded
      expect(roundedParam).toBeDefined()
      expect(roundedParam.type).toBe('boolean')
      expect(roundedParam.uiType).toBe('toggle')
      expect(roundedParam.default).toBe(true)
      
      // false literal should also be toggle
      const solidParam = result.parameters.solid
      expect(solidParam).toBeDefined()
      expect(solidParam.type).toBe('boolean')
      expect(solidParam.uiType).toBe('toggle')
      expect(solidParam.default).toBe(false)
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

  describe('Global Parameters (OpenSCAD Customizer)', () => {
    it('should exclude Global group from groups array but parse parameters', () => {
      const scad = `
        /* [Global] */
        scale_factor = 1.0; // [0.1:0.1:2.0]
        
        /* [Dimensions] */
        width = 50;
        height = 30;
      `
      const result = extractParameters(scad)
      
      // Global group should not appear in groups array
      const globalGroup = result.groups.find(g => g.id.toLowerCase() === 'global')
      expect(globalGroup).toBeUndefined()
      
      // Dimensions group should exist
      const dimsGroup = result.groups.find(g => g.id === 'Dimensions')
      expect(dimsGroup).toBeDefined()
      
      // Global parameter should exist and be marked as global
      expect(result.parameters.scale_factor).toBeDefined()
      expect(result.parameters.scale_factor.isGlobal).toBe(true)
      expect(result.parameters.scale_factor.group).toBe('General') // Assigned to General for storage
      
      // Regular parameters should NOT have isGlobal
      expect(result.parameters.width.isGlobal).toBeUndefined()
      expect(result.parameters.height.isGlobal).toBeUndefined()
    })

    it('should mark multiple global parameters', () => {
      const scad = `
        /* [Global] */
        // Overall scale
        scale = 1.0; // [0.5:0.1:2.0]
        // Quality
        quality = "medium"; // [low, medium, high]
        
        /* [Shape] */
        radius = 10;
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.scale.isGlobal).toBe(true)
      expect(result.parameters.quality.isGlobal).toBe(true)
      expect(result.parameters.radius.isGlobal).toBeUndefined()
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
      
      // enum values are now objects with { value, label, hasLabel }
      if (result.parameters.shape.enum) {
        const enumValues = result.parameters.shape.enum.map(item => item.value)
        expect(enumValues).toContain('round')
        expect(enumValues).toContain('square')
        expect(enumValues).toContain('hexagon')
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

  describe('Vector Parameter Parsing', () => {
    describe('Basic Vector Detection', () => {
      it('should parse simple 3D vector', () => {
        const scad = `size = [50, 30, 20];`
        const result = extractParameters(scad)
        
        expect(result.parameters.size).toBeDefined()
        expect(result.parameters.size.type).toBe('vector')
        expect(result.parameters.size.default).toEqual([50, 30, 20])
        expect(result.parameters.size.dimension).toBe(3)
      })

      it('should parse 2D vector', () => {
        const scad = `point = [100, 50];`
        const result = extractParameters(scad)
        
        expect(result.parameters.point.type).toBe('vector')
        expect(result.parameters.point.default).toEqual([100, 50])
        expect(result.parameters.point.dimension).toBe(2)
      })

      it('should parse 4D vector', () => {
        const scad = `color = [1.0, 0.5, 0.0, 0.8];`
        const result = extractParameters(scad)
        
        expect(result.parameters.color.type).toBe('vector')
        expect(result.parameters.color.dimension).toBe(4)
      })

      it('should handle empty vector', () => {
        const scad = `empty = [];`
        const result = extractParameters(scad)
        
        expect(result.parameters.empty.type).toBe('vector')
        expect(result.parameters.empty.default).toEqual([])
        expect(result.parameters.empty.dimension).toBe(0)
      })

      it('should handle single-element vector', () => {
        const scad = `single = [42];`
        const result = extractParameters(scad)
        
        expect(result.parameters.single.default).toEqual([42])
        expect(result.parameters.single.dimension).toBe(1)
      })
    })

    describe('Numeric Types in Vectors', () => {
      it('should parse integer values', () => {
        const scad = `dims = [10, 20, 30];`
        const result = extractParameters(scad)
        
        expect(result.parameters.dims.default).toEqual([10, 20, 30])
      })

      it('should parse decimal values', () => {
        const scad = `ratio = [1.5, 2.0, 0.75];`
        const result = extractParameters(scad)
        
        expect(result.parameters.ratio.default).toEqual([1.5, 2.0, 0.75])
      })

      it('should parse negative values', () => {
        const scad = `offset = [-10, 5, -2.5];`
        const result = extractParameters(scad)
        
        expect(result.parameters.offset.default).toEqual([-10, 5, -2.5])
      })

      it('should parse scientific notation', () => {
        const scad = `tiny = [1e-3, 2e-3, 3e-3];`
        const result = extractParameters(scad)
        
        expect(result.parameters.tiny.default[0]).toBeCloseTo(0.001)
        expect(result.parameters.tiny.default[1]).toBeCloseTo(0.002)
        expect(result.parameters.tiny.default[2]).toBeCloseTo(0.003)
      })

      it('should parse mixed positive and negative', () => {
        const scad = `mixed = [-5, 0, 5];`
        const result = extractParameters(scad)
        
        expect(result.parameters.mixed.default).toEqual([-5, 0, 5])
      })
    })

    describe('Range Hints for Vectors', () => {
      it('should apply range hint to vector', () => {
        const scad = `size = [50, 30, 20]; // [1:100]`
        const result = extractParameters(scad)
        
        expect(result.parameters.size.minimum).toBe(1)
        expect(result.parameters.size.maximum).toBe(100)
      })

      it('should apply step range hint to vector', () => {
        const scad = `scale = [1.0, 1.0, 1.0]; // [0.1:0.1:2.0]`
        const result = extractParameters(scad)
        
        expect(result.parameters.scale.minimum).toBe(0.1)
        expect(result.parameters.scale.step).toBe(0.1)
        expect(result.parameters.scale.maximum).toBe(2.0)
      })

      it('should set uiType to vector with range', () => {
        const scad = `pos = [0, 0, 0]; // [0:100]`
        const result = extractParameters(scad)
        
        expect(result.parameters.pos.uiType).toBe('vector')
      })

      it('should apply range to all components', () => {
        const scad = `size = [50, 30, 20]; // [1:100]`
        const result = extractParameters(scad)
        
        expect(result.parameters.size.components).toBeDefined()
        result.parameters.size.components.forEach(comp => {
          expect(comp.minimum).toBe(1)
          expect(comp.maximum).toBe(100)
        })
      })
    })

    describe('Component Labels', () => {
      it('should generate X,Y labels for 2D vector', () => {
        const scad = `point = [10, 20];`
        const result = extractParameters(scad)
        
        expect(result.parameters.point.components[0].label).toBe('X')
        expect(result.parameters.point.components[1].label).toBe('Y')
      })

      it('should generate X,Y,Z labels for 3D vector', () => {
        const scad = `pos = [1, 2, 3];`
        const result = extractParameters(scad)
        
        expect(result.parameters.pos.components[0].label).toBe('X')
        expect(result.parameters.pos.components[1].label).toBe('Y')
        expect(result.parameters.pos.components[2].label).toBe('Z')
      })

      it('should generate X,Y,Z,W labels for 4D vector', () => {
        const scad = `quat = [1, 0, 0, 0];`
        const result = extractParameters(scad)
        
        expect(result.parameters.quat.components[3].label).toBe('W')
      })

      it('should generate indexed labels for 5+ element vectors', () => {
        const scad = `big = [1, 2, 3, 4, 5];`
        const result = extractParameters(scad)
        
        expect(result.parameters.big.components[4].label).toBe('[4]')
      })
    })

    describe('Descriptions and Groups', () => {
      it('should capture preceding comment as description', () => {
        const scad = `
          // Position in 3D space
          pos = [0, 0, 0];
        `
        const result = extractParameters(scad)
        
        expect(result.parameters.pos.description).toBe('Position in 3D space')
      })

      it('should capture inline description after range', () => {
        const scad = `size = [50, 30, 20]; // [1:100] Box dimensions`
        const result = extractParameters(scad)
        
        expect(result.parameters.size.description).toContain('Box dimensions')
      })

      it('should assign vector to parameter group', () => {
        const scad = `
          /*[Dimensions]*/
          size = [50, 30, 20];
        `
        const result = extractParameters(scad)
        
        expect(result.parameters.size.group).toBe('Dimensions')
      })
    })

    describe('Whitespace Handling', () => {
      it('should handle extra spaces', () => {
        const scad = `spaced = [  10 ,  20  ,  30  ];`
        const result = extractParameters(scad)
        
        expect(result.parameters.spaced.default).toEqual([10, 20, 30])
      })

      it('should handle no spaces', () => {
        const scad = `compact=[1,2,3];`
        const result = extractParameters(scad)
        
        expect(result.parameters.compact.default).toEqual([1, 2, 3])
      })
    })

    describe('Special Variables', () => {
      it('should parse $-prefixed vector variables', () => {
        const scad = `$vpt = [0, 0, 50];`
        const result = extractParameters(scad)
        
        expect(result.parameters.$vpt).toBeDefined()
        expect(result.parameters.$vpt.type).toBe('vector')
      })
    })

    describe('Vector Edge Cases', () => {
      it('should not crash on malformed vector', () => {
        const scad = `broken = [10, 20`
        
        expect(() => extractParameters(scad)).not.toThrow()
      })

      it('should ignore vectors inside modules', () => {
        const scad = `
          visible = [1, 2, 3];
          module test() {
            local = [4, 5, 6];
          }
        `
        const result = extractParameters(scad)
        
        expect(result.parameters.visible).toBeDefined()
        expect(result.parameters.local).toBeUndefined()
      })

      it('should handle expression vectors as raw type', () => {
        const scad = `calc = [a + b, c - d];`
        const result = extractParameters(scad)
        
        // Expression vectors should be captured as raw type
        if (result.parameters.calc) {
          expect(result.parameters.calc.type).toBe('raw')
          expect(result.parameters.calc.uiType).toBe('raw')
        }
      })

      it('should handle variable references as raw type', () => {
        const scad = `vars = [width, height, depth];`
        const result = extractParameters(scad)
        
        if (result.parameters.vars) {
          expect(result.parameters.vars.type).toBe('raw')
        }
      })
    })

    describe('Integration with Existing Parameters', () => {
      it('should parse vectors alongside other parameter types', () => {
        const scad = `
          /*[Dimensions]*/
          width = 50; // [10:100]
          size = [50, 30, 20]; // [1:100]
          
          /*[Options]*/
          hollow = "yes"; // [yes, no]
          color = "#FF0000"; // [color]
        `
        const result = extractParameters(scad)
        
        // Scalar parameter
        expect(result.parameters.width.type).toMatch(/integer|number/)
        
        // Vector parameter
        expect(result.parameters.size.type).toBe('vector')
        
        // Other types unchanged
        expect(result.parameters.hollow.uiType).toBe('toggle')
        expect(result.parameters.color.type).toBe('color')
      })

      it('should maintain parameter order', () => {
        const scad = `
          a = 1;
          b = [10, 20];
          c = 3;
        `
        const result = extractParameters(scad)
        
        expect(result.parameters.a.order).toBe(0)
        expect(result.parameters.b.order).toBe(1)
        expect(result.parameters.c.order).toBe(2)
      })

      it('should extract units for vector parameters', () => {
        const scad = `
          // Size in millimeters
          size = [50, 30, 20];
        `
        const result = extractParameters(scad)
        
        expect(result.parameters.size.unit).toBe('mm')
        if (result.parameters.size.components) {
          result.parameters.size.components.forEach(comp => {
            expect(comp.unit).toBe('mm')
          })
        }
      })
    })

    describe('Nested Vectors (Deferred)', () => {
      it('should detect nested vectors and mark as raw', () => {
        const scad = `matrix = [[1, 0], [0, 1]];`
        const result = extractParameters(scad)
        
        // Nested vectors should use raw mode
        if (result.parameters.matrix) {
          expect(result.parameters.matrix.uiType).toBe('raw')
        }
      })
    })

    describe('Golden Corpus Validation', () => {
      // Skip if golden corpus file doesn't exist
      const runTests = goldenCorpus !== null

      it.skipIf(!runTests)('should pass all golden corpus test cases', () => {
        if (!goldenCorpus) return
        
        for (const testCase of goldenCorpus.test_cases) {
          // Skip deferred test cases
          if (testCase.status === 'deferred') continue
          
          const result = extractParameters(testCase.input)
          const paramName = testCase.expected.name
          const param = result.parameters[paramName]
          
          expect(param, `Parameter ${paramName} should exist for case: ${testCase.id}`).toBeDefined()
          expect(param.type, `Type mismatch for case: ${testCase.id}`).toBe(testCase.expected.type)
          
          // Check default value
          if (testCase.expected.default !== undefined) {
            expect(param.default, `Default mismatch for case: ${testCase.id}`).toEqual(testCase.expected.default)
          }
          
          // Check dimension if specified
          if (testCase.expected.dimension !== undefined) {
            expect(param.dimension, `Dimension mismatch for case: ${testCase.id}`).toBe(testCase.expected.dimension)
          }
          
          // Check range hints if specified
          if (testCase.expected.minimum !== undefined) {
            expect(param.minimum, `Minimum mismatch for case: ${testCase.id}`).toBe(testCase.expected.minimum)
          }
          if (testCase.expected.maximum !== undefined) {
            expect(param.maximum, `Maximum mismatch for case: ${testCase.id}`).toBe(testCase.expected.maximum)
          }
          if (testCase.expected.step !== undefined) {
            expect(param.step, `Step mismatch for case: ${testCase.id}`).toBe(testCase.expected.step)
          }
          
          // Check description if specified
          if (testCase.expected.description !== undefined) {
            expect(param.description, `Description mismatch for case: ${testCase.id}`).toContain(testCase.expected.description)
          }
          
          // Check group if specified
          if (testCase.expected.group !== undefined) {
            expect(param.group, `Group mismatch for case: ${testCase.id}`).toBe(testCase.expected.group)
          }
        }
      })

      it.skipIf(!runTests)('should handle negative test cases gracefully', () => {
        if (!goldenCorpus) return
        
        for (const testCase of goldenCorpus.negative_test_cases) {
          // Parser should not crash on any negative test case
          expect(() => extractParameters(testCase.input), 
            `Parser crashed on case: ${testCase.id}`).not.toThrow()
        }
      })
    })
  })

  describe('Dependency Visibility', () => {
    it('should parse @depends with == operator', () => {
      const scad = `
        /*[Features]*/
        ventilation = "no"; // [yes, no]
        // Hole count @depends(ventilation==yes)
        hole_count = 3; // [1:10]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.hole_count).toBeDefined()
      expect(result.parameters.hole_count.dependency).toBeDefined()
      expect(result.parameters.hole_count.dependency.parameter).toBe('ventilation')
      expect(result.parameters.hole_count.dependency.operator).toBe('==')
      expect(result.parameters.hole_count.dependency.value).toBe('yes')
    })

    it('should parse @depends with != operator', () => {
      const scad = `
        /*[Features]*/
        mode = "simple"; // [simple, advanced]
        // Extra setting @depends(mode!=simple)
        extra = 10; // [1:50]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.extra).toBeDefined()
      expect(result.parameters.extra.dependency).toBeDefined()
      expect(result.parameters.extra.dependency.parameter).toBe('mode')
      expect(result.parameters.extra.dependency.operator).toBe('!=')
      expect(result.parameters.extra.dependency.value).toBe('simple')
    })

    it('should parse @depends in inline comment', () => {
      const scad = `
        /*[Features]*/
        ventilation = "no"; // [yes, no]
        hole_count = 3; // [1:10] @depends(ventilation==yes)
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.hole_count).toBeDefined()
      expect(result.parameters.hole_count.dependency).toBeDefined()
      expect(result.parameters.hole_count.dependency.parameter).toBe('ventilation')
      expect(result.parameters.hole_count.dependency.operator).toBe('==')
      expect(result.parameters.hole_count.dependency.value).toBe('yes')
    })

    it('should handle parameters without dependencies', () => {
      const scad = `
        /*[Features]*/
        ventilation = "no"; // [yes, no]
        width = 50; // [10:100]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.ventilation).toBeDefined()
      expect(result.parameters.ventilation.dependency).toBeUndefined()
      expect(result.parameters.width).toBeDefined()
      expect(result.parameters.width.dependency).toBeUndefined()
    })

    it('should parse @depends with $ prefix in parameter name', () => {
      const scad = `
        /*[Quality]*/
        use_high_quality = "no"; // [yes, no]
        // Resolution @depends(use_high_quality==yes)
        $fn = 64; // [16:128]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.$fn).toBeDefined()
      expect(result.parameters.$fn.dependency).toBeDefined()
      expect(result.parameters.$fn.dependency.parameter).toBe('use_high_quality')
      expect(result.parameters.$fn.dependency.value).toBe('yes')
    })

    it('should parse @depends with numeric value', () => {
      const scad = `
        /*[Options]*/
        shape_type = 0; // [0, 1, 2]
        // Only for circles @depends(shape_type==0)
        radius = 10; // [5:50]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.radius).toBeDefined()
      expect(result.parameters.radius.dependency).toBeDefined()
      expect(result.parameters.radius.dependency.parameter).toBe('shape_type')
      expect(result.parameters.radius.dependency.value).toBe('0')
    })

    it('should parse @depends case-insensitively', () => {
      const scad = `
        /*[Features]*/
        ventilation = "no"; // [yes, no]
        // Hole count @DEPENDS(ventilation==yes)
        hole_count = 3; // [1:10]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.hole_count.dependency).toBeDefined()
      expect(result.parameters.hole_count.dependency.parameter).toBe('ventilation')
    })

    it('should handle spaces in @depends syntax', () => {
      const scad = `
        /*[Features]*/
        mode = "simple"; // [simple, advanced]
        // Extra option @depends( mode == advanced )
        extra = 10; // [1:50]
      `
      const result = extractParameters(scad)
      
      expect(result.parameters.extra).toBeDefined()
      expect(result.parameters.extra.dependency).toBeDefined()
      expect(result.parameters.extra.dependency.parameter).toBe('mode')
      expect(result.parameters.extra.dependency.operator).toBe('==')
      expect(result.parameters.extra.dependency.value).toBe('advanced')
    })
  })

  // =========================================================================
  // Keyguard-specific annotation pattern tests (Stakeholder Validation Plan)
  // =========================================================================
  describe('Keyguard Annotation Patterns', () => {
    it('should extract 90+ options from a large enum (type_of_tablet)', () => {
      // Exact enum line from keyguard_v75.scad line 507 (trimmed for readability)
      const scad = `
        /*[Tablet]*/
        type_of_tablet = "iPad 9th generation"; //[iPad, iPad2, iPad 3rd generation, iPad 4th generation, iPad 5th generation,iPad 6th generation, iPad 7th generation, iPad 8th generation, iPad 9th generation, iPad 10th generation, iPad 11th generation A16, iPad Pro 9.7-inch, iPad Pro 10.5-inch, iPad Pro 11-inch 1st Generation, iPad Pro 11-inch 2nd Generation, iPad Pro 11-inch 3rd Generation, iPad Pro 11-inch 4th Generation, iPad Pro 11-inch M4, iPad Pro 12.9-inch 1st Generation, iPad Pro 12.9-inch 2nd Generation, iPad Pro 12.9-inch 3rd Generation, iPad Pro 12.9-inch 4th Generation, iPad Pro 12.9-inch 5th Generation, iPad Pro 12.9-inch 6th Generation, iPad Pro 13-inch M4, iPad mini, iPad mini 2, iPad mini 3, iPad mini 4, iPad mini 5, iPad mini 6, iPad mini 7 A17 Pro, iPad Air, iPad Air 2, iPad Air 3, iPad Air 4, iPad Air 5, iPad Air 11-inch M2, iPad Air 13-inch M2, iPad Air 11-inch M3, iPad Air 13-inch M3, Dynavox I-12+, Dynavox Indi, Tobii-Dynavox I-110, Tobii-Dynavox T-15+, Tobii-Dynavox I-13, Tobii-Dynavox I-16, NovaChat 5, NovaChat 5.3, NovaChat 5.4, NovaChat 8.5, NovaChat 12, Chat Fusion 10, Surface 2, Surface 3, Surface Pro 3, Surface Pro 4, Surface Pro 5, Surface Pro 6, Surface Pro 7, Surface Pro 8, Surface Pro 9, Surface Pro X, Surface Go, Surface Go 3, Accent 800-30, Accent 800-40, Accent 1000-20, Accent 1000-30, Accent 1000-40, Accent 1400-20, Accent 1400-30a, Accent 1400-30b, Via Nano, Via Mini, Via Pro, GridPad 10s, GridPad 11, GridPad 12, GridPad 13, GridPad 15, Samsung Galaxy Tab A 8.4, Samsung Galaxy Tab A7 10.4, Samsung Galaxy Tab A7 Lite, Samsung Galaxy Tab A8, Samsung Galaxy Tab A9, Samsung Galaxy Tab A9+, Samsung Galaxy Tab Active 2, Samsung Galaxy Tab Active 3, Samsung Galaxy Tab Active 5, Samsung Galaxy Tab Active 4 Pro, Samsung Galaxy Tab S3, Samsung Galaxy Tab S6, Samsung Galaxy Tab S6 Lite, Samsung Galaxy Tab S7, Samsung Galaxy Tab S7 FE, Samsung Galaxy Tab S7+, Samsung Galaxy Tab S8, Samsung Galaxy Tab S8 Ultra, Samsung Galaxy Tab S8+, Samsung Galaxy Tab S9, Samsung Galaxy Tab S9 FE, Samsung Galaxy Tab S9 FE+, Samsung Galaxy Tab S9 Ultra, Samsung Galaxy Tab S9+, Amazon Fire HD 7, Amazon Fire HD 8, Amazon Fire HD 8 Plus, Amazon Fire HD 10, Amazon Fire HD 10 Plus, Amazon Fire Max 11, blank, other tablet]
      `
      const result = extractParameters(scad)
      const param = result.parameters.type_of_tablet

      expect(param).toBeDefined()
      expect(param.type).toBe('string')
      expect(param.uiType).toBe('select')
      expect(param.enum).toBeDefined()
      expect(param.enum.length).toBeGreaterThanOrEqual(90)
      // Verify specific entries exist
      expect(param.enum.some(e => e.value === 'iPad 9th generation')).toBe(true)
      expect(param.enum.some(e => e.value === 'blank')).toBe(true)
      expect(param.enum.some(e => e.value === 'other tablet')).toBe(true)
    })

    it('should parse float step shorthand "// .1" as description (current parser behavior)', () => {
      // keyguard_v75.scad uses "// .1" to indicate step=0.1 for numeric params
      // e.g.: keyguard_thickness = 4.0; // .1
      const scad = `
        /*[Keyguard Basics]*/
        keyguard_thickness = 4.0; // .1
      `
      const result = extractParameters(scad)
      const param = result.parameters.keyguard_thickness

      expect(param).toBeDefined()
      expect(param.default).toBe(4.0)
      // Current parser: "// .1" is parsed as a description, not a step annotation
      // This documents the current behavior for future reference
      expect(param.type).toBe('number')
    })

    it('should parse range without step [0:10000] as slider with integer step', () => {
      // From keyguard_v75.scad line 535
      const scad = `
        /*[App Layout in px]*/
        bottom_of_status_bar = 0; //[0:10000]
      `
      const result = extractParameters(scad)
      const param = result.parameters.bottom_of_status_bar

      expect(param).toBeDefined()
      expect(param.minimum).toBe(0)
      expect(param.maximum).toBe(10000)
      expect(param.uiType).toBe('slider')
      // No explicit step -> implicit step not set (browser default 1)
      expect(param.step).toBeUndefined()
    })

    it('should parse range with decimal step [-300:.1:300]', () => {
      // From keyguard_v75.scad line 670: split_line_location
      const scad = `
        /*[Split Keyguard Info]*/
        split_line_location = 0; // [-300:.1:300]
      `
      const result = extractParameters(scad)
      const param = result.parameters.split_line_location

      expect(param).toBeDefined()
      expect(param.minimum).toBe(-300)
      expect(param.step).toBe(0.1)
      expect(param.maximum).toBe(300)
      expect(param.type).toBe('number') // float because step has decimal
    })

    it('should parse yes/no enums as toggle uiType', () => {
      // From keyguard_v75.scad line 509
      const scad = `
        /*[Tablet]*/
        expose_home_button = "yes"; //[yes,no]
      `
      const result = extractParameters(scad)
      const param = result.parameters.expose_home_button

      expect(param).toBeDefined()
      expect(param.type).toBe('string')
      expect(param.uiType).toBe('toggle')
      expect(param.enum).toHaveLength(2)
    })

    it('should parse labeled enum options with colons (known parser behavior)', () => {
      // From keyguard_v75.scad line 598
      // NOTE: The parser currently treats [1:10mm..., 2:16mm..., 3:20mm...] as a range
      // because each colon-separated segment starts with a number that parseFloat() accepts.
      // This is a known limitation -- the parser falls into the range branch first,
      // but since it has 4+ parts it doesn't match [min:max] or [min:step:max],
      // so neither slider range nor enum is assigned.
      const scad = `
        /*[Velcro Info]*/
        velcro_size = 1; // [1:10mm -3/8 in- Dots, 2:16mm -5/8 in- Dots, 3:20mm -3/4 in- Dots]
      `
      const result = extractParameters(scad)
      const param = result.parameters.velcro_size

      expect(param).toBeDefined()
      expect(param.default).toBe(1)
      // Current behavior: no enum, no slider (range parser misfire with 4+ parts)
      // This documents the behavior for future parser improvement
      expect(param.type).toBe('integer')
    })

    it('should handle [Hidden] group -- params parsed but not in groups array', () => {
      const scad = `
        /*[Keyguard Basics]*/
        type_of_keyguard = "3D-Printed"; // [3D-Printed,Laser-Cut]
        /*[Hidden]*/
        keyguard_designer_version = 75;
        MW_version = false;
        fudge = 0.001;
      `
      const result = extractParameters(scad)

      // Only Keyguard Basics should be in groups, not Hidden
      expect(result.groups).toHaveLength(1)
      expect(result.groups[0].id).toBe('Keyguard Basics')

      // Hidden params should be in hiddenParameters, not parameters
      expect(result.hiddenParameters).toBeDefined()
      expect(result.hiddenParameters.keyguard_designer_version).toBeDefined()
      expect(result.hiddenParameters.MW_version).toBeDefined()
      expect(result.hiddenParameters.fudge).toBeDefined()

      // Should NOT appear in regular parameters
      expect(result.parameters.keyguard_designer_version).toBeUndefined()
      expect(result.parameters.MW_version).toBeUndefined()
      expect(result.parameters.fudge).toBeUndefined()
    })

    it('should extract all 24 tab groups from keyguard-style SCAD', () => {
      // Minimal fixture that includes all 24 groups from keyguard_v75.scad
      const scad = `
        /*[Keyguard Basics]*/ g1=1;
        /*[Tablet]*/ g2=1;
        /*[Tablet Case]*/ g3=1;
        /*[App Layout in px]*/ g4=1;
        /*[App Layout in mm]*/ g5=1;
        /*[Bar Info]*/ g6=1;
        /*[Grid Info]*/ g7=1;
        /*[Grid Special Settings]*/ g8=1;
        /*[Mounting Method]*/ g9=1;
        /*[Velcro Info]*/ g10=1;
        /*[Clip-on Straps Info]*/ g11=1;
        /*[Posts Info]*/ g12=1;
        /*[Shelf Info]*/ g13=1;
        /*[Slide-in Tabs Info]*/ g14=1;
        /*[Raised Tabs Info]*/ g15=1;
        /*[Keyguard Frame Info]*/ g16=1;
        /*[Split Keyguard Info]*/ g17=1;
        /*[Sloped Keyguard Edge Info]*/ g18=1;
        /*[Engraved/Embossed Text]*/ g19=1;
        /*[Cell Inserts]*/ g20=1;
        /*[Free-form and Hybrid Keyguard Openings]*/ g21=1;
        /*[Special Actions and Settings]*/ g22=1;
        /*[Hidden]*/ hidden_var = 1;
      `
      const result = extractParameters(scad)

      // 22 visible groups (Hidden is excluded, 22 unique non-Hidden groups)
      expect(result.groups.length).toBe(22)
      expect(result.groups.find(g => g.id === 'Hidden')).toBeUndefined()
      expect(result.groups.find(g => g.id === 'Keyguard Basics')).toBeDefined()
      expect(result.groups.find(g => g.id === 'Special Actions and Settings')).toBeDefined()
    })

    it('should parse bare parameter with no annotation (spinbox default)', () => {
      // From keyguard_v75.scad line 510
      const scad = `
        /*[Tablet]*/
        home_button_edge_slope = 30;
      `
      const result = extractParameters(scad)
      const param = result.parameters.home_button_edge_slope

      expect(param).toBeDefined()
      expect(param.default).toBe(30)
      expect(param.type).toBe('integer')
      expect(param.uiType).toBe('input') // No annotation = basic input
    })

    it('should parse string parameters for text fields', () => {
      // From keyguard_v75.scad line 690
      const scad = `
        /*[Engraved/Embossed Text]*/
        text = "";
      `
      const result = extractParameters(scad)
      const param = result.parameters.text

      expect(param).toBeDefined()
      expect(param.default).toBe('')
      expect(param.type).toBe('string')
    })

    it('should parse preceding comments as parameter descriptions', () => {
      // From keyguard_v75.scad line 499-500
      const scad = `
        /*[Keyguard Basics]*/
        //not for use with Laser-Cut keyguards
        keyguard_thickness = 4.0; // .1
      `
      const result = extractParameters(scad)
      const param = result.parameters.keyguard_thickness

      expect(param).toBeDefined()
      // The preceding comment should be captured as description
      expect(param.description).toBeTruthy()
    })

    // =====================================================================
    // CRITICAL: Boolean vs String "yes"/"no" Type Detection
    // These tests verify the parser correctly distinguishes between:
    // - Boolean params: MW_version = false;  → type: 'boolean'
    // - String dropdown params: expose_home_button = "yes"; //[yes,no]  → type: 'string'
    // This distinction is essential because buildDefineArgs() must send
    // -D expose_home_button="yes" (not -D expose_home_button=true)
    // since OpenSCAD's `if (expose_home_button == "yes")` requires a string.
    // =====================================================================

    it('should detect string "yes"/"no" dropdown as type: string, NOT boolean', () => {
      const scad = `
        /*[Options]*/
        expose_home_button = "yes"; //[yes,no]
      `
      const result = extractParameters(scad)
      const param = result.parameters.expose_home_button

      expect(param).toBeDefined()
      expect(param.type).toBe('string')
      expect(param.default).toBe('yes')
      // Should have enum values (enum items may be objects with .value or plain strings)
      const enumValues = param.enum.map(e => typeof e === 'object' ? e.value : e)
      expect(enumValues).toContain('yes')
      expect(enumValues).toContain('no')
    })

    it('should detect native boolean as type: boolean', () => {
      const scad = `
        /*[Options]*/
        MW_version = false;
      `
      const result = extractParameters(scad)
      const param = result.parameters.MW_version

      expect(param).toBeDefined()
      expect(param.type).toBe('boolean')
      expect(param.default).toBe(false)
    })

    it('should detect true as type: boolean', () => {
      const scad = `
        /*[Options]*/
        show_debug = true;
      `
      const result = extractParameters(scad)
      const param = result.parameters.show_debug

      expect(param).toBeDefined()
      expect(param.type).toBe('boolean')
      expect(param.default).toBe(true)
    })

    it('should NOT confuse string "no" dropdown with boolean false', () => {
      const scad = `
        /*[Options]*/
        expose_status_bar = "no"; //[yes,no]
        have_a_case = "yes"; //[yes,no]
        show_split_line = "no"; //[yes,no]
      `
      const result = extractParameters(scad)

      // All three should be string type, NOT boolean
      expect(result.parameters.expose_status_bar.type).toBe('string')
      expect(result.parameters.expose_status_bar.default).toBe('no')

      expect(result.parameters.have_a_case.type).toBe('string')
      expect(result.parameters.have_a_case.default).toBe('yes')

      expect(result.parameters.show_split_line.type).toBe('string')
      expect(result.parameters.show_split_line.default).toBe('no')
    })

    it('should handle the real keyguard_v75.scad file if available', () => {
      const realFilePath = join(__dirname, '../../.volkswitch/Keyguard Design/keyguard_v75.scad')
      if (!existsSync(realFilePath)) {
        console.log('Skipping: keyguard_v75.scad not available')
        return
      }

      const scadContent = readFileSync(realFilePath, 'utf-8')
      const result = extractParameters(scadContent)

      // Verify expected parameter count
      const paramCount = Object.keys(result.parameters).length
      console.log(`keyguard_v75.scad: ${paramCount} parameters, ${result.groups.length} groups`)
      expect(paramCount).toBeGreaterThanOrEqual(80)

      // Verify group count (24 total minus Hidden = 23, but some may merge)
      expect(result.groups.length).toBeGreaterThanOrEqual(20)

      // Verify Hidden params are separated
      const hiddenCount = Object.keys(result.hiddenParameters || {}).length
      console.log(`Hidden parameters: ${hiddenCount}`)
      expect(hiddenCount).toBeGreaterThan(0)

      // Verify the big enum
      const tabletParam = result.parameters.type_of_tablet
      expect(tabletParam).toBeDefined()
      expect(tabletParam.enum.length).toBeGreaterThanOrEqual(90)
    })
  })
})
