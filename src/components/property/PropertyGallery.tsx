import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid3x3, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function PropertyGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const openAt = (i: number) => {
    setIndex(i);
    setOpen(true);
  };

  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  return (
    <>
      {/* Desktop: 1 + 4 grid */}
      <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 rounded-3xl overflow-hidden aspect-[16/8] relative">
        <button
          onClick={() => openAt(0)}
          className="col-span-2 row-span-2 relative overflow-hidden group"
        >
          <img src={images[0]} alt={name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </button>
        {images.slice(1, 5).map((img, i) => (
          <button key={i} onClick={() => openAt(i + 1)} className="relative overflow-hidden group">
            <img src={img} alt={`${name} ${i + 2}`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </button>
        ))}
        <Button
          onClick={() => openAt(0)}
          variant="outline"
          size="sm"
          className="absolute bottom-4 right-4 bg-card shadow-card rounded-xl gap-2 font-semibold"
        >
          <Grid3x3 className="h-4 w-4" />
          Voir les {images.length} photos
        </Button>
      </div>

      {/* Mobile: swipeable */}
      <div className="md:hidden -mx-4 relative">
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => openAt(i)}
              className="shrink-0 w-full snap-center aspect-[4/3]"
            >
              <img src={img} alt={`${name} ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs font-medium px-2.5 py-1 rounded-full">
          1 / {images.length}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-6xl p-0 bg-black border-0 [&>button]:hidden">
          <div className="relative h-[85vh] flex items-center justify-center">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 z-20 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur grid place-items-center text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute top-4 left-4 z-20 bg-white/10 backdrop-blur text-white text-sm font-medium px-3 py-1.5 rounded-full">
              {index + 1} / {images.length}
            </div>

            <button onClick={prev} className="absolute left-4 z-20 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur grid place-items-center text-white">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button onClick={next} className="absolute right-4 z-20 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur grid place-items-center text-white">
              <ChevronRight className="h-6 w-6" />
            </button>

            <AnimatePresence mode="wait">
              <motion.img
                key={index}
                src={images[index]}
                alt={`${name} ${index + 1}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="max-h-full max-w-full object-contain"
              />
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
