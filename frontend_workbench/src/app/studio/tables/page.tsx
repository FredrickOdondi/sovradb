"use client";

import { useState, useEffect } from "react";
import { Table2, Plus, Filter, Search, MoreHorizontal, Pencil, Trash2, Copy, FileCode2, ArrowRightLeft, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createTable, fetchProjectPolicy, fetchSchemaNodes, fetchTableData, dropTable, fetchTableColumns, insertRow, deleteRow, updateRow } from "@/app/actions";

const initialMockData = {};

export default function TableExplorerPage() {
  const [mockData, setMockData] = useState<Record<string, any[]>>(initialMockData);
  const [tableColumnsMap, setTableColumnsMap] = useState<Record<string, any[]>>({});
  const [activeTable, setActiveTable] = useState<string>("");
  const [environment, setEnvironment] = useState<"Production" | "Development">("Development");
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState("");
  const [namespace, setNamespace] = useState<string>("your_namespace");
  const [offset, setOffset] = useState<number>(0);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  useEffect(() => {
    async function loadNamespace() {
      const res = await fetchProjectPolicy();
      if (res.success && res.data) {
        setNamespace(res.data.company_name);
      }
    }
    async function loadTables() {
      const res = await fetchSchemaNodes();
      if (res.success && res.data) {
        const newData: Record<string, any[]> = {};
        const newCols: Record<string, any[]> = {};
        for (const node of res.data) {
          const dataRes = await fetchTableData(node.table_name, environment);
          newData[node.table_name] = dataRes.success ? dataRes.data : [];
          
          const colRes = await fetchTableColumns(node.table_name);
          newCols[node.table_name] = colRes.success ? colRes.data : [];
        }
        setMockData(newData);
        setTableColumnsMap(newCols);
        if (res.data.length > 0) {
          setActiveTable(res.data[0].table_name);
        }
      }
    }
    loadNamespace();
    loadTables();

    // Sync branches from localStorage
    const loadBranches = () => {
      const saved = localStorage.getItem("sovra_mock_branches");
      if (saved) {
        const parsed = JSON.parse(saved).filter((b: any) => !b.isMain).map((b: any) => b.name);
        setBranches(parsed);
        if (parsed.length > 0 && !activeBranch) {
          setActiveBranch(parsed[parsed.length - 1]);
        }
      }
    };
    loadBranches();
    window.addEventListener("sovra_branches_updated", loadBranches);
    return () => window.removeEventListener("sovra_branches_updated", loadBranches);
  }, []);

  // Refetch data when environment or active table changes
  useEffect(() => {
    async function refetchActiveTable() {
      if (!activeTable) return;
      setOffset(0);
      const dataRes = await fetchTableData(activeTable, environment, 0);
      if (dataRes.success) {
        setMockData(prev => ({ ...prev, [activeTable]: dataRes.data }));
      }
    }
    refetchActiveTable();
  }, [environment, activeTable]);

  async function loadMore() {
    if (!activeTable) return;
    setIsLoadingMore(true);
    const newOffset = offset + 100;
    const dataRes = await fetchTableData(activeTable, environment, newOffset);
    if (dataRes.success && dataRes.data.length > 0) {
      setMockData(prev => ({ 
        ...prev, 
        [activeTable]: [...(prev[activeTable] || []), ...dataRes.data] 
      }));
      setOffset(newOffset);
    }
    setIsLoadingMore(false);
  }

  // Create Table Dialog State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newColumns, setNewColumns] = useState<{name: string, type: string, isPk: boolean, isFpe: boolean}[]>([{ name: "", type: "text", isPk: false, isFpe: false }]);

  // Edit Row Dialog State
  const [isEditRowModalOpen, setIsEditRowModalOpen] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState(-1);
  const [editingRowData, setEditingRowData] = useState<Record<string, any>>({});

  // Filter State
  type FilterCondition = { column: string, operator: string, value: string };
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [filterCol, setFilterCol] = useState("");
  const [filterOp, setFilterOp] = useState("=");
  const [filterVal, setFilterVal] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const columns = tableColumnsMap[activeTable]?.map(c => c.column_name) || [];

  // Filtering Logic
  let filteredData = mockData[activeTable] || [];
  if (filters.length > 0) {
    filteredData = filteredData.filter(row => {
      return filters.every(f => {
        const rowVal = String((row as any)[f.column] || "");
        const val = String(f.value);
        if (f.operator === "=") return rowVal === val;
        if (f.operator === "!=") return rowVal !== val;
        if (f.operator === ">") return Number(rowVal) > Number(val);
        if (f.operator === "<") return Number(rowVal) < Number(val);
        if (f.operator === ">=") return Number(rowVal) >= Number(val);
        if (f.operator === "<=") return Number(rowVal) <= Number(val);
        if (f.operator === "LIKE") return rowVal.includes(val);
        if (f.operator === "ILIKE") return rowVal.toLowerCase().includes(val.toLowerCase());
        return true;
      });
    });
  }
  const data = filteredData;

  const enforceEnvironment = () => {
    if (environment === "Production") {
      toast.error("Production Mutation Blocked", { description: "Direct UI mutations are disabled in Production. Please switch to the Development environment."});
      return false;
    }
    return true;
  };

  const handleTableAction = async (action: string, tableName: string) => {
    if (action === "Copy SQL Definition") {
      toast.success("SQL Copied", { description: `CREATE TABLE ${tableName} (...) copied to clipboard.` });
      return;
    }

    if (!enforceEnvironment()) return;

    const newData = { ...mockData };
    
    if (action === "Create New Table") {
      setIsCreateModalOpen(true);
      setNewTableName("");
      setNewColumns([{ name: "", type: "text", isPk: false, isFpe: false }]);
    } else if (action === "Duplicate Table") {
      newData[`${tableName}_copy`] = [...newData[tableName]];
      toast.success(`Duplicated ${tableName}`);
    } else if (action === "Drop Table") {
      const res = await dropTable(tableName);
      if (!res.success) {
        toast.error("Failed to drop table", { description: res.error });
        return;
      }
      delete newData[tableName];
      if (activeTable === tableName) setActiveTable(Object.keys(newData)[0] || "");
      toast.success(`Dropped ${tableName}`);
    }
    
    setMockData(newData);
  };

  const handleRowAction = async (action: string, rowIndex: number = -1) => {
    if (!enforceEnvironment()) return;

    const newData = { ...mockData };
    const tableData = [...newData[activeTable]];

    if (action === "Insert Row") {
      const payload: any = {};
      const generate16CharId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      payload.id = generate16CharId();

      columns.forEach(c => {
        if (c !== "id" && c !== "created_at") {
          payload[c] = "new_value";
        }
      });
      const res = await insertRow(activeTable, payload);
      if (!res.success) {
        toast.error("Failed to insert row", { description: res.error });
        return;
      }
      tableData.unshift(res.data);
      toast.success("Row Inserted");
    } else if (action === "Delete Row") {
      const rowId = tableData[rowIndex]?.id;
      if (rowId) {
        const res = await deleteRow(activeTable, rowId);
        if (!res.success) {
          toast.error("Failed to delete row", { description: res.error });
          return;
        }
      }
      tableData.splice(rowIndex, 1);
      toast.success("Row Deleted");
    }

    newData[activeTable] = tableData;
    setMockData(newData);
  };

  const submitEditRow = async () => {
    const rowId = editingRowData.id;
    if (rowId) {
      const payload = { ...editingRowData };
      delete payload.id;
      delete payload.created_at;
      const res = await updateRow(activeTable, rowId, payload);
      if (!res.success) {
        toast.error("Failed to update row", { description: res.error });
        return;
      }
      const newData = { ...mockData };
      newData[activeTable][editingRowIndex] = res.data;
      setMockData(newData);
    } else {
      // Fallback for mock data without an ID
      const newData = { ...mockData };
      newData[activeTable][editingRowIndex] = editingRowData;
      setMockData(newData);
    }
    
    setIsEditRowModalOpen(false);
    toast.success("Row Updated");
  };

  const submitCreateTable = async () => {
    if (!newTableName.trim()) {
      toast.error("Table name is required.");
      return;
    }
    const validCols = newColumns.filter(c => c.name.trim() !== "");
    if (validCols.length === 0) {
      toast.error("Must provide at least one valid column name.");
      return;
    }
    
    // Call the server action to actually create the table on the DB, applying FPE & replication!
    const res = await createTable(newTableName, validCols.map(c => ({
      name: c.name,
      type: c.type,
      isPrimaryKey: c.isPk,
      isFpe: c.isFpe
    })));
    
    if (!res.success) {
      toast.error("Database Deployment Failed", { description: res.error });
      return;
    }

    // Update UI
    const emptyRow: any = {};
    const generate16CharId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    
    emptyRow.id = generate16CharId();
    validCols.forEach(c => emptyRow[c.name.trim()] = "null");
    
    const newData = { ...mockData };
    newData[newTableName] = [emptyRow];
    setMockData(newData);
    
    const newColsMap = { ...tableColumnsMap };
    newColsMap[newTableName] = [{ column_name: "id" }, ...validCols.map(c => ({ column_name: c.name.trim() }))];
    setTableColumnsMap(newColsMap);

    setActiveTable(newTableName);
    setIsCreateModalOpen(false);
    toast.success(`Table '${newTableName}' Deployed`, {
      description: `Synced to Edge, FPE configured, and partitioned.`
    });
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-in fade-in zoom-in-95 duration-500 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-2">
            <Table2 className="h-6 w-6" />
            Table Explorer
          </h1>
          <p className="text-muted-foreground mt-1 text-sm flex items-center gap-2">
            Viewing rows in <span className="font-mono text-primary bg-primary/10 px-1 py-0.5 rounded">{namespace}.{activeTable}</span>
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-secondary/50 p-1 rounded-md border border-border shadow-sm">
            <button 
              onClick={() => {
                setEnvironment("Production");
                toast.info("Switched to Production (Read-Only)");
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-all duration-200 ${environment === "Production" ? "bg-orange-500/10 text-orange-500 border border-orange-500/30 shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}
            >
              Production
            </button>
            <button 
              onClick={() => {
                if (environment !== "Development") {
                  setEnvironment("Development");
                  toast.success("Switched to Development", { description: `You are now working in branch: ${activeBranch}` });
                }
              }}
              className={`px-4 py-1.5 text-xs font-bold rounded transition-all duration-200 ${environment === "Development" ? "bg-blue-500/10 text-blue-500 border border-blue-500/30 shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary/80"}`}
            >
              Development
            </button>
          </div>

          <div className={`flex items-center bg-secondary/50 p-1 px-3 rounded-md border border-border shadow-sm transition-opacity ${environment === "Production" ? "opacity-50 pointer-events-none" : ""}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mr-2"><line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
            <select 
              value={activeBranch}
              onChange={(e) => {
                setActiveBranch(e.target.value);
                toast.success(`Switched Branch`, { description: `Now working in ${e.target.value}` });
              }}
              className="text-xs font-mono bg-transparent text-foreground border-none focus:ring-0 cursor-pointer outline-none appearance-none pr-4 w-[150px] truncate"
              style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="%23888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6-6"/></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right center' }}
            >
              {branches.map(b => <option key={b} value={b} className="bg-card text-foreground">{b}</option>)}
            </select>
          </div>

          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1 cursor-pointer hover:bg-primary/20" onClick={() => handleRowAction("Insert Row")}>
            <Plus className="h-3 w-3" /> Insert Row
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 mt-6 overflow-hidden border border-border/50 rounded-md bg-card">
        <div className="w-64 border-r border-border/50 bg-secondary/10 flex flex-col">
          <div className="p-4 border-b border-border/50 flex justify-between items-center bg-secondary/30">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tables</span>
            <button 
              onClick={() => handleTableAction("Create New Table", "new_table")}
              className="text-primary hover:bg-primary/20 p-1 rounded transition-colors" 
              title="Create New Table"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2 flex flex-col gap-1 overflow-y-auto">
            {Object.keys(mockData).map((tableName) => (
              <div 
                key={tableName}
                className={`group flex items-center justify-between text-sm px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  activeTable === tableName 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
                onClick={() => setActiveTable(tableName)}
              >
                <div className="flex items-center gap-2 truncate">
                  <Table2 className="h-3 w-3 opacity-50" />
                  {tableName}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleTableAction("Duplicate Table", tableName); }} className="hover:text-blue-500" title="Duplicate Table"><Copy className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleTableAction("Copy SQL Definition", tableName); }} className="hover:text-orange-500" title="Copy SQL"><FileCode2 className="h-3 w-3" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleTableAction("Drop Table", tableName); }} className="hover:text-red-500" title="Drop Table"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center gap-4 p-3 border-b border-border/50 bg-secondary/5 text-sm text-muted-foreground">
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger className={`flex items-center gap-2 cursor-pointer transition-colors outline-none focus:ring-0 ${filters.length > 0 ? "text-orange-500 font-medium" : "hover:text-foreground"}`}>
                <Filter className="h-4 w-4"/> Filter {filters.length > 0 && `(${filters.length})`}
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="start">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Add Filter</h4>
                  <div className="grid gap-2">
                    <Select value={filterCol} onValueChange={(val) => val && setFilterCol(val)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    
                    <Select value={filterOp} onValueChange={(val) => val && setFilterOp(val)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Operator" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">Equal (=)</SelectItem>
                        <SelectItem value="!=">Not Equal (!=)</SelectItem>
                        <SelectItem value=">">Greater Than (&gt;)</SelectItem>
                        <SelectItem value="<">Less Than (&lt;)</SelectItem>
                        <SelectItem value=">=">Greater or Eq (&gt;=)</SelectItem>
                        <SelectItem value="<=">Less or Eq (&lt;=)</SelectItem>
                        <SelectItem value="LIKE">Contains (LIKE)</SelectItem>
                        <SelectItem value="ILIKE">Contains (ILIKE)</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input 
                      placeholder="Value" 
                      className="h-8 text-xs"
                      value={filterVal}
                      onChange={(e) => setFilterVal(e.target.value)}
                    />
                    
                    <Button 
                      size="sm" 
                      className="w-full mt-2" 
                      onClick={() => {
                        if (filterCol && filterVal) {
                          setFilters([...filters, { column: filterCol, operator: filterOp, value: filterVal }]);
                          setFilterCol("");
                          setFilterVal("");
                          setIsFilterOpen(false);
                        }
                      }}
                    >
                      Apply Filter
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {filters.length > 0 && (
              <div className="flex items-center gap-2">
                {filters.map((f, i) => (
                  <Badge key={i} variant="secondary" className="text-xs bg-secondary/50 font-mono pr-1.5 flex items-center gap-1">
                    {f.column} {f.operator} {f.value}
                    <X 
                      className="h-3 w-3 ml-1 cursor-pointer hover:text-red-500" 
                      onClick={() => setFilters(filters.filter((_, index) => index !== i))}
                    />
                  </Badge>
                ))}
                <button onClick={() => setFilters([])} className="text-xs text-muted-foreground hover:text-foreground underline ml-2">Clear</button>
              </div>
            )}

            <div className="flex items-center gap-2 hover:text-foreground cursor-pointer transition-colors ml-2"><Search className="h-4 w-4"/> Search</div>
            <div className="flex-1"></div>
            <div className="text-xs font-mono">{data.length} rows fetched</div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader className="bg-secondary/20 sticky top-0 shadow-sm">
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col} className="font-mono text-xs">{col}</TableHead>
                  ))}
                  <TableHead className="w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i} className="group">
                    {columns.map((col) => (
                      <TableCell key={col} className="font-mono text-sm max-w-[200px] truncate text-muted-foreground group-hover:text-muted-foreground transition-colors">
                        {(row as any)[col]}
                      </TableCell>
                    ))}
                    <TableCell className="text-right flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil 
                        className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-orange-500 transition-colors" 
                        onClick={() => {
                          if (!enforceEnvironment()) return;
                          setEditingRowIndex(i);
                          setEditingRowData({ ...row });
                          setIsEditRowModalOpen(true);
                        }} 
                      />
                      <Trash2 className="h-3 w-3 text-muted-foreground cursor-pointer hover:text-red-500" onClick={() => handleRowAction("Delete Row", i)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.length >= 100 && data.length % 100 === 0 && (
              <div className="flex justify-center p-4 border-t border-border">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadMore} 
                  disabled={isLoadingMore}
                  className="font-mono text-xs"
                >
                  {isLoadingMore ? "Loading..." : "Load More (100)"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>Create Custom Table</DialogTitle>
            <DialogDescription>
              Define your table schema. It will be automatically geo-partitioned according to your Sovereign Gateway rules.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Table Name</label>
              <Input 
                id="name" 
                placeholder="e.g. products" 
                value={newTableName} 
                onChange={(e) => setNewTableName(e.target.value)} 
                className="bg-secondary/20"
              />
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-medium">Schema Definition</label>
              <div className="bg-secondary/10 rounded-md border border-border/50 p-2 space-y-2 max-h-[300px] overflow-y-auto">
                <div className="flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase">
                  <div className="flex-1">Column Name</div>
                  <div className="w-[120px]">Data Type</div>
                  <div className="w-[40px] text-center">PK</div>
                  <div className="w-[40px] text-center">FPE</div>
                  <div className="w-[30px]"></div>
                </div>
                {newColumns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <Input 
                      value={col.name} 
                      onChange={(e) => {
                        const cols = [...newColumns];
                        cols[idx].name = e.target.value;
                        setNewColumns(cols);
                      }} 
                      placeholder="e.g. user_id" 
                      className="flex-1 bg-secondary/30 h-8 text-sm"
                    />
                    <select 
                      value={col.type}
                      onChange={(e) => {
                        const cols = [...newColumns];
                        cols[idx].type = e.target.value;
                        setNewColumns(cols);
                      }}
                      className="w-[120px] h-8 bg-secondary/30 border border-border rounded-md text-sm px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="uuid">uuid</option>
                      <option value="text">text</option>
                      <option value="varchar">varchar</option>
                      <option value="integer">integer</option>
                      <option value="boolean">boolean</option>
                      <option value="timestamptz">timestamptz</option>
                      <option value="jsonb">jsonb</option>
                    </select>
                    <button 
                      onClick={() => {
                        const cols = [...newColumns];
                        cols[idx].isPk = !cols[idx].isPk;
                        setNewColumns(cols);
                      }}
                      className={`w-[40px] h-8 rounded border text-xs font-bold transition-colors ${col.isPk ? 'bg-primary/20 text-primary border-primary/50' : 'bg-transparent text-muted-foreground border-border hover:bg-secondary'}`}
                      title="Primary Key"
                    >
                      PK
                    </button>
                    <button 
                      onClick={() => {
                        const cols = [...newColumns];
                        cols[idx].isFpe = !cols[idx].isFpe;
                        setNewColumns(cols);
                      }}
                      className={`w-[40px] h-8 rounded border text-xs font-bold transition-colors ${col.isFpe ? 'bg-orange-500/20 text-orange-500 border-orange-500/50' : 'bg-transparent text-muted-foreground border-border hover:bg-secondary'}`}
                      title="Format-Preserving Encryption"
                    >
                      FPE
                    </button>
                    <button 
                      onClick={() => {
                        const cols = [...newColumns];
                        cols.splice(idx, 1);
                        setNewColumns(cols);
                      }}
                      className="w-[30px] h-8 flex items-center justify-center text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setNewColumns([...newColumns, { name: "", type: "text", isPk: false, isFpe: false }])}
                  className="w-full h-8 mt-2 border-dashed border-border/50 text-muted-foreground hover:text-primary"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Column
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={submitCreateTable} className="bg-primary text-primary-foreground hover:bg-primary/90">Deploy Table</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditRowModalOpen} onOpenChange={setIsEditRowModalOpen}>
        <DialogContent className="sm:max-w-[500px] border-border bg-card">
          <DialogHeader>
            <DialogTitle>Edit Row</DialogTitle>
            <DialogDescription>
              Directly modify the record inside <span className="font-mono text-primary bg-primary/10 px-1 py-0.5 rounded">{namespace}.{activeTable}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
            {Object.keys(editingRowData).map((colName) => (
              <div key={colName} className="space-y-1.5">
                <label className="text-xs font-bold font-mono text-muted-foreground uppercase tracking-wider">{colName}</label>
                <Input 
                  value={editingRowData[colName] || ""} 
                  onChange={(e) => setEditingRowData({...editingRowData, [colName]: e.target.value})} 
                  className="bg-secondary/20 font-mono text-sm"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRowModalOpen(false)}>Cancel</Button>
            <Button onClick={submitEditRow} className="bg-primary text-primary-foreground hover:bg-primary/90">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
