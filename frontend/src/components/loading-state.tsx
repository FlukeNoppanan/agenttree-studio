import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function LoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Checking system status">
      {[0, 1].map((item) => (
        <Card key={item}>
          <CardHeader className="space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-52" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-24 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
