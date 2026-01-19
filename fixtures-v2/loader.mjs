/**
 * Fixture Loader - Expands compact YAML fixtures into full JSON
 *
 * Usage:
 *   node fixtures-v2/loader.mjs contexts/nominal/api-basic.yaml
 *   node fixtures-v2/loader.mjs --all --output fixtures-v2/expanded
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple YAML parser (handles our subset without external deps)
function parseYaml(content) {
  const lines = content.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  let currentArray = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Skip document separators
    if (line.trim() === '---') continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Array item
    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();

      // Find the array to add to
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (currentArray && currentArray.indent === indent) {
        if (value.includes(':')) {
          // Object in array: - key: value
          const obj = {};
          const [k, v] = value.split(':').map(s => s.trim());
          obj[k] = parseValue(v);

          // Check if next lines are part of this object
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j];
            if (!nextLine.trim() || nextLine.trim().startsWith('#')) { j++; continue; }
            const nextIndent = nextLine.search(/\S/);
            if (nextIndent <= indent) break;
            if (nextLine.trim().startsWith('- ')) break;

            const [nk, nv] = nextLine.trim().split(':').map(s => s.trim());
            if (nk && nv !== undefined) {
              obj[nk] = parseValue(nv);
            }
            j++;
          }
          i = j - 1;

          currentArray.arr.push(obj);
        } else {
          currentArray.arr.push(parseValue(value));
        }
      }
      continue;
    }

    // Pop stack for decreased indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    currentArray = null;

    // Key: value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    const parent = stack[stack.length - 1].obj;

    if (rawValue === '' || rawValue === '|' || rawValue === '>') {
      // Nested object or multiline string
      if (rawValue === '|' || rawValue === '>') {
        // Multiline string - collect following indented lines
        let multiline = [];
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextIndent = nextLine.search(/\S/);
          if (nextLine.trim() && nextIndent <= indent) break;
          multiline.push(nextLine.slice(indent + 2) || '');
          j++;
        }
        i = j - 1;
        parent[key] = multiline.join('\n').trimEnd();
      } else {
        // Nested object
        parent[key] = {};
        stack.push({ obj: parent[key], indent });
      }
    } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      // Inline array
      const items = rawValue.slice(1, -1).split(',').map(s => parseValue(s.trim()));
      parent[key] = items;
    } else {
      // Check if next line starts an array
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.trim().startsWith('- ')) {
        parent[key] = [];
        currentArray = { arr: parent[key], indent: nextLine.search(/\S/) };
      } else {
        parent[key] = parseValue(rawValue);
      }
    }
  }

  return result;
}

function parseValue(str) {
  if (str === undefined || str === '') return '';

  // Strip inline comments (but not inside quoted strings)
  if (!str.startsWith('"') && !str.startsWith("'")) {
    const hashIdx = str.indexOf('#');
    if (hashIdx > 0) {
      str = str.slice(0, hashIdx).trim();
    }
  }

  if (str === 'true') return true;
  if (str === 'false') return false;
  if (str === 'null') return null;
  if (str === '{}') return {};
  if (str === '[]') return [];
  if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1);
  if (str.startsWith("'") && str.endsWith("'")) return str.slice(1, -1);
  if (/^-?\d+$/.test(str)) return parseInt(str, 10);
  if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
  return str;
}

// Deep merge objects
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] === null) {
      result[key] = null;
    } else if (Array.isArray(source[key])) {
      result[key] = [...source[key]];
    } else if (typeof source[key] === 'object' && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

// Load template
function loadTemplate(name) {
  const templatePath = path.join(__dirname, 'templates', `${name}.yaml`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${name}`);
  }
  return parseYaml(fs.readFileSync(templatePath, 'utf8'));
}

// Expand a fixture file
function expandFixture(fixturePath) {
  const content = fs.readFileSync(fixturePath, 'utf8');
  const fixture = parseYaml(content);

  // Get template
  const templateName = fixture._template || 'api-request';
  delete fixture._template;

  // Load and merge template
  const template = loadTemplate(templateName);
  return deepMerge(template, fixture);
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.length === 0) {
  console.log(`
Fixture Loader - Expands compact YAML fixtures into full JSON

Usage:
  node fixtures-v2/loader.mjs <fixture.yaml>           Print expanded JSON
  node fixtures-v2/loader.mjs --all                    Expand all fixtures

Examples:
  node fixtures-v2/loader.mjs contexts/nominal/api-basic.yaml
  node fixtures-v2/loader.mjs --all
`);
  process.exit(0);
}

if (args.includes('--all')) {
  // Expand all fixtures
  const contextsDir = path.join(__dirname, 'contexts');
  const expectedDir = path.join(__dirname, 'expected');

  const processDir = (dir, type) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        processDir(itemPath, type);
      } else if (item.name.endsWith('.yaml')) {
        const expanded = expandFixture(itemPath);
        const relativePath = path.relative(__dirname, itemPath);
        console.log(`\n--- ${relativePath} ---`);
        console.log(JSON.stringify(expanded, null, 2));
      }
    }
  };

  console.log('=== CONTEXTS ===');
  processDir(contextsDir, 'context');
  console.log('\n=== EXPECTED ===');
  processDir(expectedDir, 'expected');

} else {
  // Single file
  const fixturePath = path.isAbsolute(args[0])
    ? args[0]
    : path.join(__dirname, args[0]);

  if (!fs.existsSync(fixturePath)) {
    console.error(`File not found: ${fixturePath}`);
    process.exit(1);
  }

  const expanded = expandFixture(fixturePath);
  console.log(JSON.stringify(expanded, null, 2));
}
