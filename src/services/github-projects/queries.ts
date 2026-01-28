/**
 * GraphQL queries for GitHub Projects v2 API.
 */

/**
 * Query to fetch all items from a GitHub Project with priority field.
 * This query is designed to work with both organization and user projects.
 *
 * @param owner - The owner login (organization or user)
 * @param number - The project number
 * @param priorityField - Optional name of the priority field to fetch
 */
export function buildProjectItemsQuery(owner: string, number: number, priorityField?: string): string {
  const priorityFieldFragment = priorityField
    ? `
            priorityValue: fieldValueByName(name: "${priorityField}") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
              }
              ... on ProjectV2ItemFieldTextValue {
                text
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
              }
            }`
    : '';

  // Try both organization and user paths
  return `
    query {
      org: organization(login: "${owner}") {
        projectV2(number: ${number}) {
          items(first: 100) {
            nodes {
              content {
                ... on Issue {
                  number
                }
              }${priorityFieldFragment}
            }
          }
        }
      }
      user(login: "${owner}") {
        projectV2(number: ${number}) {
          items(first: 100) {
            nodes {
              content {
                ... on Issue {
                  number
                }
              }${priorityFieldFragment}
            }
          }
        }
      }
    }
  `;
}

/**
 * Extract priority value from a GraphQL field value node.
 */
export function extractPriorityValue(fieldValue: any): string | undefined {
  if (!fieldValue) return undefined;

  // Single select field
  if (fieldValue.name !== undefined) {
    return fieldValue.name;
  }

  // Text field
  if (fieldValue.text !== undefined) {
    return fieldValue.text;
  }

  // Number field
  if (fieldValue.number !== undefined) {
    return String(fieldValue.number);
  }

  return undefined;
}
