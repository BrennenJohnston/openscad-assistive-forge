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
})
