/**
 * OpenSCAD Customizer Parameter Parser
 * @license GPL-3.0-or-later
 */

import { detectLibraries } from './library-manager.js';

/**
 * Numeric literal pattern - matches integers, decimals, negative, and scientific notation
 * @type {RegExp}
 */
const NUMERIC_LITERAL = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Default labels for vector components based on dimension
 * @param {number} dimension - Number of components
 * @param {number} index - Component index (0-based)
 * @returns {string} Label for the component
 */
function getDefaultComponentLabel(dimension, index) {
  if (dimension <= 4) {
    const labels = ['X', 'Y', 'Z', 'W'];
    return labels[index] || `[${index}]`;
  }
  return `[${index}]`;
}

/**
 * Check if a string represents a numeric literal
 * @param {string} str - String to check
 * @returns {boolean} True if numeric literal
 */
function isNumericLiteral(str) {
  return NUMERIC_LITERAL.test(str.trim());
}

/**
 * Split vector content by comma, respecting nested brackets
 * @param {string} content - Content inside brackets (without outer [ ])
 * @returns {Array<string>} Array of component strings
 */
function splitVectorComponents(content) {
  const components = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = null;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const prevChar = content[i - 1];

    // Track string boundaries
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }

    if (!inString) {
      if (char === '[') depth++;
      if (char === ']') depth--;

      // Split on comma at depth 0
      if (char === ',' && depth === 0) {
        components.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  // Don't forget the last component
  const trimmed = current.trim();
  if (trimmed) {
    components.push(trimmed);
  }

  return components;
}

/**
 * Check if vector content contains only numeric literals (safe to parse)
 * @param {string} content - Content inside brackets (without outer [ ])
 * @returns {boolean} True if all components are numeric literals
 */
function isLiteralVector(content) {
  // Handle empty vector
  if (!content.trim()) {
    return true;
  }

  const components = splitVectorComponents(content);

  // Check each component
  return components.every((comp) => {
    const trimmed = comp.trim();

    // Nested vectors: recursively check
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return isLiteralVector(trimmed.slice(1, -1));
    }

    // Must be a numeric literal
    return isNumericLiteral(trimmed);
  });
}

/**
 * Detect why a vector failed to parse as literal
 * @param {string} content - Vector content
 * @returns {string} Failure reason
 */
function detectFailureReason(content) {
  const components = splitVectorComponents(content);

  for (const comp of components) {
    const trimmed = comp.trim();

    // Skip nested vectors for this check
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      continue;
    }

    // Check for common non-literal patterns
    if (/[a-zA-Z_][a-zA-Z0-9_]*/.test(trimmed)) {
      if (
        trimmed.includes('+') ||
        trimmed.includes('-') ||
        trimmed.includes('*') ||
        trimmed.includes('/')
      ) {
        return 'expression_detected';
      }
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
        return 'variable_reference';
      }
      if (trimmed.includes('(')) {
        return 'function_call';
      }
    }
  }

  return 'unparseable';
}

/**
 * Parse a single vector component value
 * @param {string} valueStr - Single component value string
 * @returns {Object} Parsed component with type and value
 */
function parseVectorComponent(valueStr) {
  const trimmed = valueStr.trim();

  // Nested vector
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const innerContent = trimmed.slice(1, -1);
    const result = parseVectorValue(innerContent);
    return { type: 'vector', value: result.values, nested: true };
  }

  // Numeric value
  const num = parseFloat(trimmed);
  if (!isNaN(num)) {
    return { type: 'number', value: num };
  }

  // Fallback (shouldn't happen for validated vectors)
  return { type: 'expression', value: trimmed };
}

/**
 * Parse vector literal into structured components
 * @param {string} content - Content inside brackets (without outer [ ])
 * @returns {Object} Parsed vector with values and components
 */
function parseVectorValue(content) {
  // Handle empty vector
  if (!content.trim()) {
    return {
      values: [],
      components: [],
      dimension: 0,
    };
  }

  const componentStrings = splitVectorComponents(content);
  const values = [];
  const components = [];

  componentStrings.forEach((compStr, index) => {
    const parsed = parseVectorComponent(compStr);
    values.push(parsed.value);

    components.push({
      type: parsed.type,
      value: parsed.value,
      label: getDefaultComponentLabel(componentStrings.length, index),
      nested: parsed.nested || false,
    });
  });

  return {
    values,
    components,
    dimension: values.length,
    nested: components.some((c) => c.nested),
  };
}

/**
 * Serialize a vector back to OpenSCAD format
 * @param {Array} values - Vector values array
 * @returns {string} OpenSCAD vector string
 */
export function serializeVector(values) {
  const parts = values.map((v) => {
    if (Array.isArray(v)) {
      return serializeVector(v);
    }
    return String(v);
  });
  return `[${parts.join(', ')}]`;
}

/**
 * Safe vector parsing with fallback to raw mode
 * @param {string} vectorStr - Full vector string including brackets
 * @returns {Object} Parsed vector or raw fallback
 */
function parseVectorSafe(vectorStr) {
  // Remove outer brackets
  const content = vectorStr.slice(1, -1);

  if (isLiteralVector(content)) {
    const parsed = parseVectorValue(content);
    return {
      type: 'vector',
      value: parsed.values,
      components: parsed.components,
      dimension: parsed.dimension,
      nested: parsed.nested || false,
      uiType: parsed.nested ? 'raw' : 'vector',
    };
  } else {
    // Fallback to raw mode
    return {
      type: 'raw',
      rawValue: vectorStr,
      parseFailureReason: detectFailureReason(content),
      uiType: 'raw',
    };
  }
}

/**
 * Parse default value from OpenSCAD code
 * @param {string} valueStr - Value string from assignment
 * @returns {Object} Parsed value with type
 */
function parseDefaultValue(valueStr) {
  const trimmed = valueStr.trim();

  // Check if it's a vector/array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseVectorSafe(trimmed);
  }

  // Check if it's a quoted string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return { type: 'string', value: trimmed.slice(1, -1) };
  }

  // Check if it's a number
  const num = parseFloat(trimmed);
  if (!isNaN(num) && trimmed !== '') {
    return {
      type:
        Number.isInteger(num) && !trimmed.includes('.') ? 'integer' : 'number',
      value: num,
    };
  }

  // Check for boolean
  if (trimmed === 'true' || trimmed === 'false') {
    return { type: 'boolean', value: trimmed === 'true' };
  }

  // Unquoted string
  return { type: 'string', value: trimmed };
}

/**
 * Desktop parity: only literal assignments become Customizer parameters.
 * Rejects variable references, expressions, and function calls
 * (desktop comment.cpp line 269: `if (!assignment->getExpr()->isLiteral()) continue;`)
 * @param {string} valueStr - Raw value string from assignment
 * @param {Object} parsedResult - Result from parseDefaultValue
 * @returns {boolean} True if the value is a literal
 */
function isLiteralAssignment(valueStr, parsedResult) {
  const trimmed = valueStr.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return true;
  }

  if (NUMERIC_LITERAL.test(trimmed)) {
    return true;
  }

  if (trimmed === 'true' || trimmed === 'false') {
    return true;
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parsedResult.type === 'vector';
  }

  return false;
}

/**
 * Parse enum values from bracket hint
 * Handles:
 *   - Simple: [opt1, opt2], [opt1,opt2], ["opt 1", "opt 2"], [0,2,4,6]
 *   - Labeled numbers: [10:S, 20:M, 30:L] - value is number, label is string
 *   - Labeled strings: [S:Small, M:Medium, L:Large] - value is string, label is string
 *
 * Returns array of objects: { value, label, hasLabel }
 * where label defaults to value when not specified (OpenSCAD Customizer compatible)
 *
 * @param {string} enumStr - Enum string from bracket hint
 * @returns {Array<{value: string, label: string, hasLabel: boolean}>} Array of enum option objects
 */
function parseEnumValues(enumStr) {
  const rawValues = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = null;

  // First pass: split by comma, respecting quotes
  for (let i = 0; i < enumStr.length; i++) {
    const char = enumStr[i];

    if (
      (char === '"' || char === "'") &&
      (i === 0 || enumStr[i - 1] !== '\\')
    ) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = null;
      } else {
        current += char;
      }
    } else if (char === ',' && !inQuotes) {
      const trimmed = current.trim();
      if (trimmed) rawValues.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }

  const trimmed = current.trim();
  if (trimmed) rawValues.push(trimmed);

  // Second pass: detect value:label format and parse accordingly
  // OpenSCAD format: [10:S, 20:M, 30:L] or [S:Small, M:Medium, L:Large]
  // The colon separates value from label
  return rawValues.map((item) => {
    // Check for value:label format (colon not inside quotes)
    // Only split on the FIRST colon to allow labels with colons
    const colonIndex = findLabelSeparator(item);

    if (colonIndex !== -1) {
      const value = item.substring(0, colonIndex).trim();
      const label = item.substring(colonIndex + 1).trim();
      return {
        value: value,
        label: label || value, // Fall back to value if label is empty
        hasLabel: true,
      };
    }

    // No label separator - value and label are the same
    return {
      value: item,
      label: item,
      hasLabel: false,
    };
  });
}

/**
 * Find the colon that separates value from label in an enum option
 * Returns -1 if no valid separator found
 * Ignores colons inside quoted strings
 * @param {string} item - Single enum option string
 * @returns {number} Index of separator colon, or -1
 */
function findLabelSeparator(item) {
  let inQuotes = false;
  let quoteChar = null;

  for (let i = 0; i < item.length; i++) {
    const char = item[i];
    const prevChar = item[i - 1];

    // Track quote state
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
        quoteChar = null;
      }
    }

    // Found separator colon (not inside quotes)
    if (char === ':' && !inQuotes) {
      return i;
    }
  }

  return -1;
}

/**
 * Parse dependency condition from comment
 * Supports: @depends(param_name==value) or @depends(param_name!=value)
 * @param {string} comment - Comment text to parse
 * @returns {Object|null} Dependency object or null if no dependency
 */
function parseDependency(comment) {
  if (!comment) return null;

  // Match: @depends(param_name==value) or @depends(param_name!=value)
  const dependsMatch = comment.match(
    /@depends\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(==|!=)\s*(\S+)\s*\)/i
  );

  if (dependsMatch) {
    return {
      parameter: dependsMatch[1],
      operator: dependsMatch[2],
      value: dependsMatch[3],
    };
  }

  return null;
}

/**
 * Extract unit from parameter description, name, or tab context.
 *
 * Resolution order (first match wins):
 *   1. Explicit unit keyword in the description/comment
 *   2. Name-suffix inference (e.g. `_height` -> mm, `_px` -> px)
 *   3. Tab-name fallback (e.g. tab "[App Layout in px]" -> px)
 *
 * @param {string} description - Parameter description (from comment)
 * @param {string} name - Parameter name
 * @param {string|null} [tabUnit=null] - Unit inferred from the enclosing tab name
 * @returns {string|null} Unit string or null if no unit detected
 */
function extractUnit(description, name, tabUnit) {
  const comment = (description || '').toLowerCase();
  const paramName = (name || '').toLowerCase();

  // Explicit units in comment
  const unitPatterns = [
    { regex: /\b(px|pixels?)\b/i, unit: 'px' },
    { regex: /\b(mm|millimeters?)\b/i, unit: 'mm' },
    { regex: /\b(cm|centimeters?)\b/i, unit: 'cm' },
    { regex: /\b(deg|degrees?|°)\b/i, unit: '°' },
    { regex: /\b(in|inches?)\b/i, unit: 'in' },
    { regex: /\b(%|percent)\b/i, unit: '%' },
  ];

  for (const { regex, unit } of unitPatterns) {
    if (regex.test(comment)) {
      return unit;
    }
  }

  // Infer from parameter name - pixel units (e.g. cell_height_in_px)
  if (/(_px|_pixels?)$/i.test(paramName)) {
    return 'px';
  }

  // Infer from parameter name - angles
  if (/angle|rotation|twist|tilt/i.test(paramName)) {
    return '°';
  }

  // Infer from parameter name - dimensions (only for numeric types with range)
  // Note: We don't add default mm for all numeric params as many are unitless
  // Only add if the name strongly suggests a physical dimension
  if (
    /(_width|_height|_depth|_thickness|_diameter|_radius|_length|_size)$|^(width|height|depth|thickness|diameter|radius|length)$/i.test(
      paramName
    )
  ) {
    return 'mm';
  }

  // Fallback: use unit inferred from tab name (e.g. "[App Layout in px]")
  if (tabUnit) {
    return tabUnit;
  }

  // No unit detected
  return null;
}

/**
 * Extract a unit hint from a tab/group name.
 * Matches patterns like "in px", "in mm", "in cm", "in inches", "in pixels".
 * @param {string} tabName - The raw tab name (e.g. "App Layout in px")
 * @returns {string|null} Canonical unit string or null
 */
function extractTabUnit(tabName) {
  if (!tabName) return null;

  const match = tabName.match(
    /\bin\s+(px|pixels?|mm|millimeters?|cm|centimeters?|deg|degrees?|in(?:ches)?|%|percent)\s*$/i
  );
  if (!match) return null;

  const raw = match[1].toLowerCase();
  if (/^(px|pixels?)$/.test(raw)) return 'px';
  if (/^(mm|millimeters?)$/.test(raw)) return 'mm';
  if (/^(cm|centimeters?)$/.test(raw)) return 'cm';
  if (/^(deg|degrees?)$/.test(raw)) return '°';
  if (/^(in(?:ches)?)$/.test(raw)) return 'in';
  if (/^(%|percent)$/.test(raw)) return '%';
  return null;
}

/**
 * Extract parameters from OpenSCAD Customizer annotations
 * @param {string} scadContent - .scad file content
 * @returns {Object} Extracted parameters structure
 */
export function extractParameters(scadContent) {
  // Guard against null/undefined input
  if (!scadContent || typeof scadContent !== 'string') {
    return { groups: [], parameters: {} };
  }

  const lines = scadContent.split('\n');
  const groups = [];
  const parameters = {};
  // Track [Hidden] parameters separately for export parity with desktop OpenSCAD
  // Hidden params: stored in JSON exports, NOT loaded from imports, NOT displayed in UI
  const hiddenParameters = {};

  let currentGroup = 'General';
  let currentTabUnit = null; // Unit inferred from the current tab name (e.g. "in px")
  let groupOrder = 0;
  let paramOrder = 0;
  let scopeDepth = 0;
  let inBlockComment = false;

  const stripForScope = (input, state) => {
    let output = '';
    let inString = false;
    let stringChar = '';
    let escapeNext = false;

    for (let idx = 0; idx < input.length; idx++) {
      const char = input[idx];
      const next = input[idx + 1];

      if (state.inBlockComment) {
        if (char === '*' && next === '/') {
          state.inBlockComment = false;
          idx += 1;
        }
        continue;
      }

      if (!inString && char === '/' && next === '*') {
        state.inBlockComment = true;
        idx += 1;
        continue;
      }

      if (!inString && char === '/' && next === '/') {
        break;
      }

      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
        output += ' ';
        continue;
      }

      if (inString) {
        if (!escapeNext && char === '\\') {
          escapeNext = true;
          continue;
        }
        if (!escapeNext && char === stringChar) {
          inString = false;
          stringChar = '';
        }
        escapeNext = false;
        output += ' ';
        continue;
      }

      output += char;
    }

    return output;
  };

  // Regex patterns
  const groupPattern = /\/\*\s*((?:\[[^\]]*\]\s*)+)\s*\*\//;
  const assignmentPattern = /^([$]?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);/;
  const bracketHintPattern = /\/\/\s*\[([^\]]+)\]/;
  const commentPattern = /\/\/\s*(.+)$/;

  // Track preceding comments for parameter descriptions
  let precedingComment = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const depthBefore = scopeDepth;
    let handledGroup = false;

    // Check for standalone comment lines (potential description for next parameter)
    if (depthBefore === 0 && line.startsWith('//') && !line.startsWith('//[')) {
      // Extract comment text (remove // prefix)
      const commentText = line.substring(2).trim();
      if (commentText && !line.match(bracketHintPattern)) {
        precedingComment = commentText;
      }
    } else if (!line.startsWith('//')) {
      // Reset preceding comment if we hit a non-comment line that's not a parameter
      // (will be captured below if it's a parameter assignment)
    }

    if (depthBefore === 0) {
      // C2: Desktop parity -- stop parsing at __Customizer_Limit__ sentinel module
      if (/^module\s+__Customizer_Limit__\s*\(/.test(line)) {
        break;
      }

      // Check for group
      const groupMatch = line.match(groupPattern);
      if (groupMatch) {
        const bracketContentRegex = /\[\s*([^\]]+)\s*\]/g;
        const bracketParts = [];
        let bracketInnerMatch;
        while (
          (bracketInnerMatch = bracketContentRegex.exec(groupMatch[1])) !== null
        ) {
          bracketParts.push(bracketInnerMatch[1].trim());
        }
        let rawGroupName = bracketParts.join(' - ');
        let groupAnnotation = null;

        // Support ":advanced" annotation suffix: /* [GroupName:advanced] */
        // Strip the suffix from the display label and store as metadata
        const annotationMatch = rawGroupName.match(
          /^(.+?)\s*:\s*(advanced|simple)\s*$/i
        );
        if (annotationMatch) {
          rawGroupName = annotationMatch[1].trim();
          groupAnnotation = annotationMatch[2].toLowerCase();
        }

        currentGroup = rawGroupName;
        currentTabUnit = extractTabUnit(rawGroupName);

        // Skip Hidden group entirely, and Global group from groups array
        // (Global params will be marked with isGlobal flag and shown on all tabs)
        const lowerGroup = currentGroup.toLowerCase();
        if (lowerGroup !== 'hidden' && lowerGroup !== 'global') {
          if (!groups.find((g) => g.id === currentGroup)) {
            const groupDef = {
              id: currentGroup,
              label: currentGroup,
              order: groupOrder++,
            };
            if (groupAnnotation) {
              groupDef.annotation = groupAnnotation;
            }
            groups.push(groupDef);
          }
        }
        handledGroup = true;
        precedingComment = ''; // Reset after group header
      }
    }

    // Check for parameter assignment (top-level only)
    if (!handledGroup && depthBefore === 0) {
      const assignMatch = line.match(assignmentPattern);
      if (assignMatch) {
        const paramName = assignMatch[1];
        const valueStr = assignMatch[2].trim();

        // Capture Hidden parameters separately (desktop parity: stored in JSON but not shown in UI)
        if (currentGroup.toLowerCase() === 'hidden') {
          const hiddenDefault = parseDefaultValue(valueStr);
          hiddenParameters[paramName] = {
            name: paramName,
            type: hiddenDefault.type,
            value: hiddenDefault.value,
          };
          const scopeState = { inBlockComment };
          const scopeLine = stripForScope(rawLine, scopeState);
          inBlockComment = scopeState.inBlockComment;
          for (const ch of scopeLine) {
            if (ch === '{') scopeDepth += 1;
            if (ch === '}') scopeDepth = Math.max(0, scopeDepth - 1);
          }
          precedingComment = ''; // Reset
          continue;
        }

        // Check if this is a Global parameter (shown on all tabs per OpenSCAD Customizer spec)
        const isGlobalParam = currentGroup.toLowerCase() === 'global';

        // Parse default value
        const defaultVal = parseDefaultValue(valueStr);

        // C3: Desktop parity -- skip non-literal assignments (expressions, variables, function calls)
        if (!isLiteralAssignment(valueStr, defaultVal)) {
          const scopeState = { inBlockComment };
          const scopeLine = stripForScope(rawLine, scopeState);
          inBlockComment = scopeState.inBlockComment;
          for (const ch of scopeLine) {
            if (ch === '{') scopeDepth += 1;
            if (ch === '}') scopeDepth = Math.max(0, scopeDepth - 1);
          }
          precedingComment = '';
          continue;
        }

        // Check for bracket hint and comment
        const afterAssignment = line.substring(line.indexOf(';') + 1);

        // C4: Desktop parity -- on multi-assignment lines, annotation applies only to last assignment
        const codeAfterSemi = afterAssignment
          .replace(/\/\/.*$/, '')
          .replace(/\/\*.*?\*\/$/, '')
          .trim();
        const isMultiAssignment = assignmentPattern.test(codeAfterSemi);
        const annotationText = isMultiAssignment ? '' : afterAssignment;

        const bracketMatch = annotationText.match(bracketHintPattern);
        const commentMatch = annotationText.match(commentPattern);

        // Capture preceding comment for description
        const capturedPrecedingComment = precedingComment;
        precedingComment = ''; // Reset after capturing

        const param = {
          name: paramName,
          type: defaultVal.type,
          default: defaultVal.value,
          // Global params use "General" as their home group, but are shown on all tabs
          group: isGlobalParam ? 'General' : currentGroup,
          order: paramOrder++,
          description: capturedPrecedingComment || '', // Use preceding comment as default description
        };

        // Mark global parameters so UI can show them on all tabs
        if (isGlobalParam) {
          param.isGlobal = true;
        }

        // If it's a vector, add vector-specific properties
        if (defaultVal.type === 'vector') {
          param.components = defaultVal.components;
          param.dimension = defaultVal.dimension;
          param.uiType = defaultVal.uiType;
          if (defaultVal.nested) {
            param.nested = true;
            // Nested vectors use raw mode for now
            param.uiType = 'raw';
          }
        } else if (defaultVal.type === 'raw') {
          // Vector that couldn't be parsed as literals
          param.rawValue = defaultVal.rawValue;
          param.parseFailureReason = defaultVal.parseFailureReason;
          param.uiType = 'raw';
        }

        if (bracketMatch) {
          const hint = bracketMatch[1].trim();

          // Check for color type: [color]
          if (hint.toLowerCase() === 'color') {
            param.type = 'color';
            param.uiType = 'color';

            // Extract comment after bracket hint
            const afterBracket = afterAssignment
              .substring(afterAssignment.indexOf(']') + 1)
              .trim();
            if (afterBracket) {
              param.description = afterBracket;
            }
          }
          // Check for file type: [file] or [file:ext1,ext2]
          else if (hint.toLowerCase().startsWith('file')) {
            param.type = 'file';
            param.uiType = 'file';

            // Extract accepted file extensions
            if (hint.includes(':')) {
              const extPart = hint.substring(hint.indexOf(':') + 1).trim();
              param.acceptedExtensions = extPart
                .split(',')
                .map((e) => e.trim());
            }

            // Extract comment after bracket hint
            const afterBracket = afterAssignment
              .substring(afterAssignment.indexOf(']') + 1)
              .trim();
            if (afterBracket) {
              param.description = afterBracket;
            }
          }
          // Check if it's a range: [min:max] or [min:step:max]
          else {
            const rangeParts = hint.split(':');
            if (
              rangeParts.length >= 2 &&
              rangeParts.every((p) => !isNaN(parseFloat(p.trim())))
            ) {
              const nums = rangeParts.map((p) => parseFloat(p.trim()));

              if (nums.length === 2) {
                // [min:max]
                param.minimum = nums[0];
                param.maximum = nums[1];
                // Only set slider for non-vector types
                if (param.type !== 'vector' && param.type !== 'raw') {
                  param.uiType = 'slider';
                }
              } else if (nums.length === 3) {
                // [min:step:max]
                param.minimum = nums[0];
                param.step = nums[1];
                param.maximum = nums[2];
                // Only set slider for non-vector types
                if (param.type !== 'vector' && param.type !== 'raw') {
                  param.uiType = 'slider';
                }

                // Determine if integer or float based on step (for non-vectors)
                if (param.type !== 'vector' && param.type !== 'raw') {
                  if (Number.isInteger(nums[1]) && !hint.includes('.')) {
                    param.type = 'integer';
                  } else {
                    param.type = 'number';
                  }
                }
              }

              // For vectors, apply range to all components
              if (param.type === 'vector' && param.components) {
                param.components = param.components.map((comp) => ({
                  ...comp,
                  minimum: param.minimum,
                  maximum: param.maximum,
                  step: param.step,
                }));
              }

              // Extract comment after bracket hint
              const afterBracket = afterAssignment
                .substring(afterAssignment.indexOf(']') + 1)
                .trim();
              if (afterBracket) {
                param.description = afterBracket;
              }
            } else if (
              rangeParts.length === 1 &&
              isNumericLiteral(hint.trim()) &&
              (param.type === 'integer' || param.type === 'number')
            ) {
              // C1: MakerBot [max] single-number slider (desktop parameterobject.cpp line 55)
              param.maximum = parseFloat(hint.trim());
              param.uiType = 'slider';

              const afterBracket = afterAssignment
                .substring(afterAssignment.indexOf(']') + 1)
                .trim();
              if (afterBracket) {
                param.description = afterBracket;
              }
            } else {
              // It's an enum: [opt1, opt2, opt3] or labeled [S:Small, M:Medium, L:Large]
              const enumValues = parseEnumValues(hint);
              param.enum = enumValues;

              // Detect boolean enum: [true, false] with a boolean default value.
              // Preserve the 'boolean' type so buildDefineArgs emits unquoted
              // true/false instead of the string "true"/"false" (which OpenSCAD
              // treats as truthy regardless of content).
              const lowerVals = enumValues.map((item) =>
                item.value.toLowerCase()
              );
              const isBooleanEnum =
                enumValues.length === 2 &&
                lowerVals.includes('true') &&
                lowerVals.includes('false') &&
                defaultVal.type === 'boolean';

              // Desktop parity: numeric enums (all values parse as numbers
              // with a numeric default) must keep their numeric type so that
              // buildDefineArgs emits unquoted values (e.g. -D angle=0, not
              // -D angle="0"). Without this, OpenSCAD warns:
              // "undefined operation (string > number)".
              const isNumericEnum =
                !isBooleanEnum &&
                (defaultVal.type === 'integer' ||
                  defaultVal.type === 'number') &&
                enumValues.every((item) => {
                  const v = typeof item === 'object' ? item.value : item;
                  return v.trim() !== '' && !isNaN(Number(v));
                });

              if (isBooleanEnum || isNumericEnum) {
                // keep param.type from parseDefaultValue
              } else {
                param.type = 'string';
              }

              // Check if it's a yes/no toggle (use value, not label, for comparison)
              if (
                isBooleanEnum ||
                (enumValues.length === 2 &&
                  lowerVals.includes('yes') &&
                  lowerVals.includes('no'))
              ) {
                param.uiType = 'toggle';
              } else {
                param.uiType = 'select';
              }

              // Extract comment after bracket hint (if any)
              const afterBracket = afterAssignment
                .substring(afterAssignment.indexOf(']') + 1)
                .trim();
              if (afterBracket) {
                param.description = afterBracket;
              }
            }
          }
        } else if (commentMatch) {
          // Comment without bracket hint
          param.description = commentMatch[1].trim();
          // Don't override uiType if already set (e.g., for vectors or raw types)
          if (!param.uiType) {
            param.uiType = 'input';
          }
        } else {
          // Bare parameter - don't override uiType if already set
          if (!param.uiType) {
            param.uiType = 'input';
          }
        }

        // Boolean parameters should use toggle UI (true/false without bracket hint)
        if (param.type === 'boolean' && param.uiType === 'input') {
          param.uiType = 'toggle';
        }

        // Extract unit for numeric parameters (with tab-name fallback)
        if (param.type === 'integer' || param.type === 'number') {
          param.unit = extractUnit(
            param.description,
            param.name,
            currentTabUnit
          );
        }

        // Extract unit for vector parameters and apply to components
        if (param.type === 'vector' && param.components) {
          const unit = extractUnit(
            param.description,
            param.name,
            currentTabUnit
          );
          if (unit) {
            param.unit = unit;
            param.components = param.components.map((comp) => ({
              ...comp,
              unit: unit,
            }));
          }
        }

        // Extract text length limit for string parameters (OpenSCAD Customizer format)
        // Format: String="value"; //8  (where 8 is the max length)
        if (param.type === 'string' && !param.enum) {
          // Check for a numeric-only comment that specifies max length
          // This matches patterns like: //8 or // 8 or //12
          const lengthMatch = annotationText.match(/\/\/\s*(\d+)\s*$/);
          if (lengthMatch) {
            const maxLength = parseInt(lengthMatch[1], 10);
            if (maxLength > 0) {
              param.maxLength = maxLength;
              // Clear description if it was just the number
              if (param.description === lengthMatch[1]) {
                param.description = '';
              }
            }
          }
        }

        // C5: Fractional step hint for numeric params (desktop parity)
        // Format: x = 5.5; // .5  (sets spinbox step to 0.5)
        if (
          (param.type === 'integer' || param.type === 'number') &&
          !param.step &&
          !param.enum
        ) {
          const stepMatch = annotationText.match(/\/\/\s*(\.\d+)\s*$/);
          if (stepMatch) {
            param.step = parseFloat(stepMatch[1]);
            param.type = 'number';
            if (param.description === stepMatch[1]) {
              param.description = capturedPrecedingComment || '';
            }
          }
        }

        // Extract dependency from comment (supports @depends(param==value))
        const fullComment =
          `${capturedPrecedingComment} ${annotationText}`.trim();
        const dependency = parseDependency(fullComment);
        if (dependency) {
          param.dependency = dependency;
        }

        parameters[paramName] = param;
      }
    }

    const scopeState = { inBlockComment };
    const scopeLine = stripForScope(rawLine, scopeState);
    inBlockComment = scopeState.inBlockComment;
    for (const ch of scopeLine) {
      if (ch === '{') scopeDepth += 1;
      if (ch === '}') scopeDepth = Math.max(0, scopeDepth - 1);
    }
  }

  // If no groups were found, create a default group
  if (groups.length === 0) {
    groups.push({
      id: 'General',
      label: 'General',
      order: 0,
    });
  }

  // Detect library usage
  const detectedLibraries = detectLibraries(scadContent);

  // Diagnostic logging: parameter count per tab group, hidden params, unparsed stats
  const paramCountByGroup = {};
  for (const param of Object.values(parameters)) {
    paramCountByGroup[param.group] = (paramCountByGroup[param.group] || 0) + 1;
  }
  console.debug('[Parser] Extraction complete:', {
    groups: groups.length,
    parameters: Object.keys(parameters).length,
    hiddenParameters: Object.keys(hiddenParameters).length,
    libraries: detectedLibraries.length,
    paramCountByGroup,
  });

  return {
    groups,
    parameters,
    hiddenParameters,
    libraries: detectedLibraries,
  };
}
