import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SearchResult {
  id: string;
  docId: string;
  docName: string;
  chunk: string;
  similarity: number;
  mime: string;
  createdAt: string;
}

interface DocSearchProps {
  projectId: string;
}

export default function DocSearch({ projectId }: DocSearchProps) {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [mime, setMime] = useState<string>("any");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [exactMatch, setExactMatch] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 20;

  const searchMutation = useMutation({
    mutationFn: async ({ searchQuery, searchOffset }: { searchQuery: string; searchOffset: number }) => {
      const body: any = {
        query: searchQuery,
        projectId,
        limit: pageSize,
        offset: searchOffset,
        exactMatch
      };
      
      if (dateFrom) body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
      if (mime && mime !== "any") body.mime = mime;

      const response = await apiRequest("POST", "/api/search/docs", body);
      return response.json();
    },
    onSuccess: (data: any) => {
      const newResults = data.results || [];
      setResults(newResults);
      setHasMore(newResults.length === pageSize);
    }
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setOffset(0);
      searchMutation.mutate({ searchQuery: query, searchOffset: 0 });
    }
  };

  const handleNextPage = () => {
    const newOffset = offset + pageSize;
    setOffset(newOffset);
    searchMutation.mutate({ searchQuery: query, searchOffset: newOffset });
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, offset - pageSize);
    setOffset(newOffset);
    searchMutation.mutate({ searchQuery: query, searchOffset: newOffset });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Semantic Search
          </CardTitle>
          <CardDescription>
            Search through document contents with filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Ask a question or search for content..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={searchMutation.isPending}
                data-testid="input-search-query"
                className="flex-1"
              />
              <Button 
                type="submit" 
                disabled={searchMutation.isPending || !query.trim()}
                data-testid="button-search"
              >
                {searchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={searchMutation.isPending}
                  data-testid="input-date-from"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={searchMutation.isPending}
                  data-testid="input-date-to"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">File Type</label>
                <Select value={mime} onValueChange={setMime} disabled={searchMutation.isPending}>
                  <SelectTrigger data-testid="select-mime-type">
                    <SelectValue placeholder="Any type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any type</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="docx">DOCX</SelectItem>
                    <SelectItem value="txt">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="exact-match"
                checked={exactMatch}
                onChange={(e) => setExactMatch(e.target.checked)}
                className="h-4 w-4"
                data-testid="checkbox-exact-match"
              />
              <label htmlFor="exact-match" className="text-sm text-muted-foreground cursor-pointer">
                Only show chunks containing exact search text (uncheck for semantic search)
              </label>
            </div>
          </form>
        </CardContent>
      </Card>

      {searchMutation.isError && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Error: {searchMutation.error instanceof Error ? searchMutation.error.message : "Search failed"}
            </p>
          </CardContent>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold" data-testid="heading-search-results">
            Search Results ({results.length})
          </h3>
          {results.map((result, idx) => (
            <Card key={result.id} data-testid={`card-search-result-${idx}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span data-testid={`text-doc-name-${idx}`}>
                    {result.docName.replace(/^[\uD800-\uDFFF\u2600-\u27BF]+\s*/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim() || result.docName}
                  </span>
                </CardTitle>
                <CardDescription data-testid={`text-metadata-${idx}`}>
                  {new Date(result.createdAt).toLocaleDateString()} • {result.mime} • Relevance: {(result.similarity * 100).toFixed(1)}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid={`text-chunk-${idx}`}>
                  {result.chunk}
                </p>
              </CardContent>
            </Card>
          ))}
          
          {/* Pagination Controls */}
          <div className="flex justify-between items-center pt-4">
            <Button
              variant="outline"
              onClick={handlePrevPage}
              disabled={offset === 0 || searchMutation.isPending}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Showing {offset + 1} - {offset + results.length}
            </span>
            <Button
              variant="outline"
              onClick={handleNextPage}
              disabled={!hasMore || searchMutation.isPending}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {searchMutation.isSuccess && results.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              No results found. Try a different search query or adjust filters.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
