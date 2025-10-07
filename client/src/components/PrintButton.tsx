import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrintButtonProps {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  label?: string;
}

export function PrintButton({ 
  variant = "outline", 
  size = "sm", 
  label = "Print" 
}: PrintButtonProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handlePrint}
      className="hide-print gap-2"
      data-testid="button-print"
    >
      <Printer className="h-4 w-4" />
      {size !== "icon" && label}
    </Button>
  );
}
