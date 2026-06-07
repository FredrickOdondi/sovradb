const fs = require('fs');
let content = fs.readFileSync('frontend_workbench/src/app/actions.ts', 'utf8');

// fetchTableData
content = content.replace(
  'export async function fetchTableData(tableName: string, environment: string = "Development", offset: number = 0) {\n  try {',
  'export async function fetchTableData(tableName: string, environment: string = "Development", offset: number = 0) {\n  try {\n    await logTraffic("READ", "fetchTableData", "Queried table: " + tableName);'
);

// insertRow
content = content.replace(
  'export async function insertRow(tableName: string, rowData: any) {\n  try {',
  'export async function insertRow(tableName: string, rowData: any) {\n  try {\n    await logTraffic("WRITE", "insertRow", "Inserted row into " + tableName);'
);

// updateRow
content = content.replace(
  'export async function updateRow(tableName: string, id: string, rowData: any) {\n  try {',
  'export async function updateRow(tableName: string, id: string, rowData: any) {\n  try {\n    await logTraffic("WRITE", "updateRow", "Updated row in " + tableName);'
);

// deleteRow
content = content.replace(
  'export async function deleteRow(tableName: string, id: string) {\n  try {',
  'export async function deleteRow(tableName: string, id: string) {\n  try {\n    await logTraffic("WRITE", "deleteRow", "Deleted row from " + tableName);'
);

// executeRawEditorQuery
content = content.replace(
  'export async function executeRawEditorQuery(query: string) {\n  try {',
  'export async function executeRawEditorQuery(query: string) {\n  try {\n    await logTraffic("QUERY", "executeRawEditorQuery", "Executed custom SQL");'
);

fs.writeFileSync('frontend_workbench/src/app/actions.ts', content);
