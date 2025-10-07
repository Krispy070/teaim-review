import React, { useEffect, useState, useRef } from 'react'
// import { useLocation as useRouterLocation } from "react-router-dom"
import NeedsAttentionLane from '../components/NeedsAttentionLane'
import PageHeading from '@/components/PageHeading'
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RoleGate } from "@/components/ui/role-gate"
import { TagsFilterBar, ArtifactTagChips } from "@/components/TagsBar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Download, FileCheck, Trash2, FileSignature, Share, Ban } from 'lucide-react'
import { useLocation } from 'wouter'
import ShareDialog from '@/components/ShareDialog'
import DocSearch from '@/components/docs/DocSearch'
import DocUploader from '@/components/docs/DocUploader'
import { postJSON } from "@/lib/authFetch"
import { downloadGET } from "@/lib/download"

export default function Library({ orgId, projectId }) {
  const hash = window.location.hash;    // e.g. "#artifact=1234-uuid"
  const { toast } = useToast()
  const [, navigate] = useLocation()
  const refs = useRef({})
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [reembedding, setReembedding] = useState(new Set())
  const [filterIds, setFilterIds] = useState([])
  const [filteredItems, setFilteredItems] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkExporting, setBulkExporting] = useState(false)
  const [shareDialog, setShareDialog] = useState({ open: false, artifactId: '' })
  const [bulkTag, setBulkTag] = useState("")
  
  // In dev mode, use admin role as set in backend dev context
  // In production, this would come from proper auth context
  const userRole = 'admin'

  useEffect(() => {
    if (!orgId || !projectId) return
    setLoading(true)
    fetch(`/api/documents/list?project_id=${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then(js => setItems(js.items || []))
      .catch(e => setErr('Failed to load artifacts'))
      .finally(() => setLoading(false))
  }, [orgId, projectId])

  // Artifact deep-linking: auto-scroll and highlight when URL has #artifact=<id>
  useEffect(() => {
    if (!hash?.startsWith("#artifact=")) return;
    const id = decodeURIComponent(hash.split("=")[1] || "");
    const el = refs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("kap-highlight");
      const t = setTimeout(() => el.classList.remove("kap-highlight"), 2400);
      return () => clearTimeout(t);
    }
  }, [hash, items]);

  // Apply tag filtering and clear selection when filter changes
  useEffect(() => {
    if (filterIds.length === 0) {
      setFilteredItems(items)
    } else {
      setFilteredItems(items.filter(item => filterIds.includes(item.id)))
    }
    // Clear selection when filter changes
    setSelectedIds(new Set())
  }, [items, filterIds]);

  // Re-embed artifact function
  async function reembedArtifact(artifact) {
    setReembedding(prev => new Set([...prev, artifact.id]))
    try {
      const response = await fetch('/api/reindex/run-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: projectId,
          artifact_id: artifact.id
        })
      })
      
      if (response.ok) {
        toast({ 
          title: "Re-embed queued", 
          description: `${artifact.title || '(untitled)'} will be re-processed` 
        })
        // Trigger refresh of restore log if it's listening
        window.dispatchEvent(new CustomEvent("kap:restore-live"))
      } else {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      toast({ 
        title: "Queue failed", 
        description: String(error?.message || error), 
        variant: "destructive" 
      })
    } finally {
      setReembedding(prev => {
        const next = new Set(prev)
        next.delete(artifact.id)
        return next
      })
    }
  }

  // Multi-select handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredItems.map(item => item.id)))
    }
  }

  const toggleSelectItem = (itemId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  // Bulk export handler
  const handleBulkExport = async () => {
    if (selectedIds.size === 0) return
    
    setBulkExporting(true)
    try {
      const response = await fetch(`/api/documents/bulk-export?project_id=${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          document_ids: Array.from(selectedIds),
          export_name: 'documents_export'
        })
      })
      
      if (response.ok) {
        // Create download link
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = response.headers.get('Content-Disposition')?.split('filename=')[1] || 'documents.zip'
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        a.remove()
        
        toast({ 
          title: "Export successful", 
          description: `Downloaded ${selectedIds.size} documents` 
        })
        setSelectedIds(new Set()) // Clear selection after export
      } else {
        const error = await response.text()
        throw new Error(error)
      }
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: String(error?.message || error), 
        variant: "destructive" 
      })
    } finally {
      setBulkExporting(false)
    }
  }

  // Handle create signoff package
  const handleCreateSignoffPackage = () => {
    if (selectedIds.size === 0) return
    
    const selectedIdsArray = Array.from(selectedIds)
    const params = new URLSearchParams({
      selected: selectedIdsArray.join(',')
    })
    navigate(`/projects/${projectId}/signoff/compose?${params.toString()}`)
  }

  const handleShare = (artifact) => {
    setShareDialog({ open: true, artifactId: artifact.id });
  }

  const handleRevokeAllLinks = async (artifact) => {
    if (!confirm("Revoke ALL active links for this document?")) return;
    try {
      const data = await postJSON(`/api/share-links/revoke_all_for_artifact?project_id=${projectId}&artifact_id=${artifact.id}`, {});
      toast({ 
        title: "Links revoked", 
        description: `${data.revoked} link(s) revoked for ${artifact.title}` 
      });
    } catch(e) {
      toast({ 
        title: "Revoke failed", 
        description: String(e?.message || e), 
        variant: "destructive" 
      });
    }
  }

  const handleDelete = async (doc) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      
      toast({ 
        title: "Document deleted", 
        description: `"${doc.title}" has been permanently deleted` 
      });
      
      setItems(items.filter(item => item.id !== doc.id));
    } catch(e) {
      toast({ 
        title: "Delete failed", 
        description: String(e?.message || e), 
        variant: "destructive" 
      });
    }
  }

  const selectedIdsArray = () => Array.from(selectedIds)

  const bulkAddTag = async () => {
    const ids = selectedIdsArray();
    if (!ids.length || !bulkTag.trim()) return;
    try {
      await Promise.all(ids.map(id => 
        postJSON(`/api/artifacts/${id}/tags/add?project_id=${projectId}`, { name: bulkTag.trim() })
      ));
      toast({ 
        title: "Tag added", 
        description: `${bulkTag} added to ${ids.length} item(s)` 
      });
      // Reload to refresh tags display
      const response = await fetch(`/api/documents/list?project_id=${encodeURIComponent(projectId)}`)
      const js = await response.json()
      setItems(js.items || [])
    } catch(e) {
      toast({ 
        title: "Add tag failed", 
        description: String(e?.message || e), 
        variant: "destructive" 
      });
    }
  }

  const bulkRemoveTag = async () => {
    const ids = selectedIdsArray();
    if (!ids.length || !bulkTag.trim()) return;
    try {
      await Promise.all(ids.map(id => 
        postJSON(`/api/artifacts/${id}/tags/remove?project_id=${projectId}`, { name: bulkTag.trim() })
      ));
      toast({ 
        title: "Tag removed", 
        description: `${bulkTag} removed from ${ids.length} item(s)` 
      });
      // Reload to refresh tags display
      const response = await fetch(`/api/documents/list?project_id=${encodeURIComponent(projectId)}`)
      const js = await response.json()
      setItems(js.items || [])
    } catch(e) {
      toast({ 
        title: "Remove tag failed", 
        description: String(e?.message || e), 
        variant: "destructive" 
      });
    }
  }

  const isAllSelected = filteredItems.length > 0 && selectedIds.size === filteredItems.length
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < filteredItems.length

  // CSV bundle export handler
  const handleCsvBundleExport = async () => {
    try {
      await downloadGET(`/api/export/csv_bundle.zip?project_id=${projectId}&types=actions,risks,decisions`, "csv_bundle.zip");
      toast({ 
        title: "CSV Bundle exported", 
        description: "Downloaded CSV bundle with project data" 
      });
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: String(error?.message || error), 
        variant: "destructive" 
      });
    }
  };

  return (
    <div className="space-y-4">
      <PageHeading 
        title="Documents" 
        crumbs={[{label:"Execution"},{label:"Documents"}]} 
      />
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCsvBundleExport}
          className="swoosh"
          data-testid="button-csv-bundle-export"
        >
          <Download className="w-4 h-4 mr-1" />
          Export CSV Bundle
        </Button>
      </div>
      <NeedsAttentionLane projectId={projectId} />
      
      <Tabs defaultValue="library" className="w-full">
        <TabsList>
          <TabsTrigger value="library" data-testid="tab-library">Library</TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">Semantic Search</TabsTrigger>
        </TabsList>
        
        <TabsContent value="library" className="space-y-4">
          <DocUploader orgId={orgId} projectId={projectId} onUploadSuccess={() => {
            // Refresh the documents list
            fetch(`/api/documents/list?project_id=${encodeURIComponent(projectId)}`)
              .then(r => r.json())
              .then(js => setItems(js.items || []))
              .catch(e => console.error('Failed to refresh documents:', e))
          }} />
          
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-700">Library Content</div>
          <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}>
            {filteredItems.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={isAllSelected ? true : isIndeterminate ? 'indeterminate' : false}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                  <span className="text-sm text-slate-600">
                    {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                  </span>
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex gap-2 items-center border rounded px-3 py-1 bg-slate-50">
                      <input 
                        className="border rounded px-2 py-1 text-sm w-32" 
                        placeholder="tag name" 
                        value={bulkTag} 
                        onChange={e=>setBulkTag(e.target.value)}
                        data-testid="input-bulk-tag"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={bulkAddTag}
                        disabled={!bulkTag.trim()}
                        data-testid="button-bulk-add-tag"
                        className="h-7 px-2 text-xs"
                      >
                        + Add
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={bulkRemoveTag}
                        disabled={!bulkTag.trim()}
                        data-testid="button-bulk-remove-tag"
                        className="h-7 px-2 text-xs"
                      >
                        − Remove
                      </Button>
                    </div>
                    <div className="h-6 w-px bg-slate-300" />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkExport}
                      disabled={bulkExporting}
                      className="swoosh"
                      data-testid="button-bulk-export"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      {bulkExporting ? 'Exporting...' : 'Export ZIP'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreateSignoffPackage}
                      className="swoosh pulse-once"
                      data-testid="button-create-signoff"
                    >
                      <FileSignature className="w-4 h-4 mr-1" />
                      Sign-off Package
                    </Button>
                  </div>
                )}
              </div>
            )}
          </RoleGate>
        </div>
        {projectId && (
          <TagsFilterBar 
            projectId={projectId} 
            onChange={async (names) => {
              if (names.length === 0) {
                setFilterIds([]);
                return;
              }
              const qs = new URLSearchParams({ project_id: projectId, tags: names.join(",") }).toString();
              const r = await fetch(`/api/artifacts/filter?${qs}`, { credentials:"include" });
              const ids = r.ok ? (await r.json()).artifact_ids : [];
              setFilterIds(ids);
            }}
          />
        )}
        {loading && <div className="text-sm text-slate-500">Loading…</div>}
        {err && <div className="text-sm text-rose-600">{err}</div>}
      <div className="divide-y">
        {filteredItems.map(a => (
          <div key={a.id} ref={el => refs.current[a.id] = el} id={`artifact-${a.id}`} className="py-2 flex items-center justify-between">
            <div className="flex items-start gap-3 flex-1">
              <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}>
                <Checkbox
                  checked={selectedIds.has(a.id)}
                  onCheckedChange={() => toggleSelectItem(a.id)}
                  className="mt-1"
                  data-testid={`checkbox-select-${a.id}`}
                />
              </RoleGate>
              <div className="space-y-1 flex-1">
                <div className="font-medium">
                  {a.signed_url ? (
                    <a 
                      href={a.signed_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-blue-600 hover:text-blue-800 hover:underline"
                      data-testid={`link-title-${a.id}`}
                    >
                      {a.title || '(untitled)'}
                    </a>
                  ) : (
                    <span>{a.title || '(untitled)'}</span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{a.mime_type} • chunks: {a.chunk_count}</div>
                {projectId && (
                  <ArtifactTagChips 
                    artifactId={a.id} 
                    projectId={projectId} 
                    canEdit={['owner','admin','pm','lead'].includes(userRole)} 
                  />
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => reembedArtifact(a)}
                  disabled={reembedding.has(a.id)}
                  data-testid={`button-reembed-${a.id}`}
                >
                  {reembedding.has(a.id) ? 'Re-embedding...' : 'Re-embed'}
                </Button>
              </RoleGate>
              <RoleGate allow={['owner', 'admin', 'pm', 'lead']} role={userRole}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevokeAllLinks(a)}
                  data-testid={`button-revoke-all-${a.id}`}
                >
                  <Ban className="w-4 h-4 mr-1" />
                  Revoke All Links
                </Button>
              </RoleGate>
              <RoleGate allow={['owner', 'admin', 'pm', 'lead', 'member']} role={userRole}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleShare(a)}
                  data-testid={`button-share-${a.id}`}
                >
                  <Share className="w-4 h-4 mr-1" />
                  Share
                </Button>
              </RoleGate>
              <RoleGate allow={['owner', 'admin']} role={userRole}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(a)}
                  className="text-red-600 hover:text-red-700 hover:border-red-300"
                  data-testid={`button-delete-${a.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </RoleGate>
              {a.signed_url
                ? <a className="text-sm px-3 py-1 border rounded hover:bg-slate-50" href={a.signed_url} target="_blank" rel="noreferrer" data-testid={`link-open-${a.id}`}>Open</a>
                : <span className="text-xs text-slate-400">no link</span>
              }
            </div>
          </div>
        ))}
      </div>
      </div>
        </TabsContent>
        
        <TabsContent value="search" className="space-y-4">
          <DocSearch projectId={projectId} />
        </TabsContent>
      </Tabs>
      
      <ShareDialog 
        open={shareDialog.open} 
        onClose={() => setShareDialog({ open: false, artifactId: '' })} 
        artifactId={shareDialog.artifactId} 
        projectId={projectId} 
      />
    </div>
  )
}