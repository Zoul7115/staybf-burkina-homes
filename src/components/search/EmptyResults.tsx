import { motion } from "framer-motion";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyResults({ onReset }: { onReset: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-16 px-6 rounded-3xl border border-dashed border-border bg-muted/30"
    >
      <div className="mx-auto h-20 w-20 rounded-full grid place-items-center bg-primary/10 text-primary mb-5">
        <SearchX className="h-10 w-10" />
      </div>
      <h3 className="font-display font-bold text-xl">Aucun hébergement trouvé</h3>
      <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
        Aucun résultat ne correspond à vos filtres. Essayez d'élargir votre recherche.
      </p>
      <Button onClick={onReset} className="mt-6 gradient-primary text-primary-foreground rounded-xl font-semibold">
        Modifier les filtres
      </Button>
    </motion.div>
  );
}
