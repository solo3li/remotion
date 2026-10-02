/**
 * Edge Condition Types for Runtime Conditional Branching
 *
 * Based on Prefect-style dynamic workflow branching.
 * Conditions are evaluated against node output at runtime to determine
 * which workflow paths to follow.
 */

/**
 * Supported comparison operators for edge conditions.
 * Matches backend operators in server/services/execution/conditions.py
 */
export type ConditionOperator =
  // Equality operators
  | 'eq'           // Equal (==)
  | 'neq'          // Not equal (!=)
  // Comparison operators (numeric)
  | 'gt'           // Greater than (>)
  | 'lt'           // Less than (<)
  | 'gte'          // Greater than or equal (>=)
  | 'lte'          // Less than or equal (<=)
  // String/list contains
  | 'contains'     // String/list contains value
  | 'not_contains' // String/list does not contain value
  // Existence checks
  | 'exists'       // Field exists and is not None
  | 'not_exists'   // Field does not exist or is None
  // Empty checks
  | 'is_empty'     // Field is empty (None, "", [], {})
  | 'is_not_empty' // Field is not empty
  // Regex match
  | 'matches'      // Regex pattern match
  // List membership
  | 'in'           // Value is in list
  | 'not_in'       // Value is not in list
  // String prefix/suffix
  | 'starts_with'  // String starts with value
  | 'ends_with'    // String ends with value
  // Boolean checks
  | 'is_true'      // Value is truthy
  | 'is_false'     // Value is falsy
  // Type checks
  | 'is_string'    // Value is a string
  | 'is_number'    // Value is a number
  | 'is_boolean'   // Value is a boolean
  | 'is_array'     // Value is an array
  | 'is_object';   // Value is an object

/**
 * Metadata for each operator - used by UI to render appropriate controls.
 */
export interface OperatorMetadata {
  label: string;
  description: string;
  requiresValue: boolean;
  valueType?: 'string' | 'number' | 'boolean' | 'array' | 'any';
}

/**
 * Registry of all operators with their metadata.
 * Matches OPERATORS dict in server/services/execution/conditions.py
 */
export const OPERATORS: Record<ConditionOperator, OperatorMetadata> = {
  // Equality
  eq: { label: 'Equals', description: 'Value equals target', requiresValue: true, valueType: 'any' },
  neq: { label: 'Not Equals', description: 'Value does not equal target', requiresValue: true, valueType: 'any' },
  // Comparison
  gt: { label: 'Greater Than', description: 'Value is greater than target', requiresValue: true, valueType: 'number' },
  lt: { label: 'Less Than', description: 'Value is less than target', requiresValue: true, valueType: 'number' },
  gte: { label: 'Greater or Equal', description: 'Value is greater than or equal to target', requiresValue: true, valueType: 'number' },
  lte: { label: 'Less or Equal', description: 'Value is less than or equal to target', requiresValue: true, valueType: 'number' },
  // Contains
  contains: { label: 'Contains', description: 'String/list contains value', requiresValue: true, valueType: 'string' },
  not_contains: { label: 'Does Not Contain', description: 'String/list does not contain value', requiresValue: true, valueType: 'string' },
  // Existence
  exists: { label: 'Exists', description: 'Field exists and is not null', requiresValue: false },
  not_exists: { label: 'Does Not Exist', description: 'Field does not exist or is null', requiresValue: false },
  // Empty
  is_empty: { label: 'Is Empty', description: 'Value is empty (null, "", [], {})', requiresValue: false },
  is_not_empty: { label: 'Is Not Empty', description: 'Value is not empty', requiresValue: false },
  // Regex
  matches: { label: 'Matches Regex', description: 'Value matches regex pattern', requiresValue: true, valueType: 'string' },
  // List membership
  in: { label: 'In List', description: 'Value is in list', requiresValue: true, valueType: 'array' },
  not_in: { label: 'Not In List', description: 'Value is not in list', requiresValue: true, valueType: 'array' },
  // String prefix/suffix
  starts_with: { label: 'Starts With', description: 'String starts with value', requiresValue: true, valueType: 'string' },
  ends_with: { label: 'Ends With', description: 'String ends with value', requiresValue: true, valueType: 'string' },
  // Boolean
  is_true: { label: 'Is True', description: 'Value is truthy', requiresValue: false },
  is_false: { label: 'Is False', description: 'Value is falsy', requiresValue: false },
  // Type checks
  is_string: { label: 'Is String', description: 'Value is a string', requiresValue: false },
  is_number: { label: 'Is Number', description: 'Value is a number', requiresValue: false },
  is_boolean: { label: 'Is Boolean', description: 'Value is a boolean', requiresValue: false },
  is_array: { label: 'Is Array', description: 'Value is an array', requiresValue: false },
  is_object: { label: 'Is Object', description: 'Value is an object', requiresValue: false },
};

/**
 * Single edge condition - evaluated against source node output.
 */
export interface EdgeCondition {
  /** Output field to check (supports dot notation: "result.status", "items.0.name") */
  field: string;
  /** Comparison operator */
  operator: ConditionOperator;
  /** Value to compare against (required for operators with requiresValue: true) */
  value?: string | number | boolean | any[];
}

/**
 * Extended edge data with condition support.
 * Used in edge.data field for conditional branching.
 */
export interface ConditionalEdgeData {
  /** Optional condition for this edge */
  condition?: EdgeCondition;
  /** Display label for the edge (shown on canvas) */
  label?: string;
  /** Logic for multiple conditions (future enhancement) */
  conditionLogic?: 'and' | 'or';
  /** Additional conditions (future enhancement) */
  additionalConditions?: EdgeCondition[];
}

/**
 * React Flow edge with conditional data.
 * Extends the base Edge type with typed data property.
 */
export interface ConditionalEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  className?: string;
  data?: ConditionalEdgeData;
}

/**
 * Props for the EdgeConditionEditor component.
 */
export interface EdgeConditionEditorProps {
  /** The edge being edited */
  edge: ConditionalEdge;
  /** Callback when condition is updated */
  onConditionChange: (condition: EdgeCondition | undefined) => void;
  /** Callback when label is updated */
  onLabelChange: (label: string | undefined) => void;
  /** Available fields from source node output (for autocomplete) */
  availableFields?: string[];
  /** Callback to close the editor */
  onClose: () => void;
}

/**
 * Get operators that don't require a value input.
 */
export function getNoValueOperators(): ConditionOperator[] {
  return (Object.keys(OPERATORS) as ConditionOperator[]).filter(
    op => !OPERATORS[op].requiresValue
  );
}

/**
 * Get operators that require a value input.
 */
export function getValueOperators(): ConditionOperator[] {
  return (Object.keys(OPERATORS) as ConditionOperator[]).filter(
    op => OPERATORS[op].requiresValue
  );
}

/**
 * Get operators grouped by category.
 */
export function getOperatorsByCategory(): Record<string, ConditionOperator[]> {
  return {
    'Equality': ['eq', 'neq'],
    'Comparison': ['gt', 'lt', 'gte', 'lte'],
    'Contains': ['contains', 'not_contains'],
    'Existence': ['exists', 'not_exists'],
    'Empty': ['is_empty', 'is_not_empty'],
    'Pattern': ['matches', 'starts_with', 'ends_with'],
    'List': ['in', 'not_in'],
    'Boolean': ['is_true', 'is_false'],
    'Type': ['is_string', 'is_number', 'is_boolean', 'is_array', 'is_object'],
  };
}

/**
 * Format condition for display (edge label).
 */
export function formatConditionLabel(condition: EdgeCondition): string {
  const op = OPERATORS[condition.operator];
  if (!op) return '';

  if (!op.requiresValue) {
    return `${condition.field} ${op.label.toLowerCase()}`;
  }

  const valueStr = Array.isArray(condition.value)
    ? `[${condition.value.join(', ')}]`
    : String(condition.value);

  return `${condition.field} ${op.label.toLowerCase()} ${valueStr}`;
}

/**
 * Validate a condition object.
 */
export function validateCondition(condition: EdgeCondition): { valid: boolean; error?: string } {
  if (!condition.field || condition.field.trim() === '') {
    return { valid: false, error: 'Field is required' };
  }

  if (!condition.operator || !OPERATORS[condition.operator]) {
    return { valid: false, error: 'Invalid operator' };
  }

  const op = OPERATORS[condition.operator];
  if (op.requiresValue && (condition.value === undefined || condition.value === '')) {
    return { valid: false, error: 'Value is required for this operator' };
  }

  return { valid: true };
}
