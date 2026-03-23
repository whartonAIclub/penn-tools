import { motion } from "framer-motion";
import { GraduationCap, Upload, Search, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const steps = [
  { icon: Upload, title: "Upload", description: "Submit your academic transcript in PDF or CSV format." },
  { icon: Search, title: "Match", description: "Our engine maps your courses to equivalent offerings at your target school." },
  { icon: CheckCircle, title: "Review", description: "Get a clear report of matched credits and any gaps to fill." },
];

const Index = () => {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-primary py-24 px-6 md:py-32">
        <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-accent/10" />
        <div className="absolute bottom-[-60px] left-[-60px] w-[200px] h-[200px] rounded-full bg-accent/10" />
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
              <GraduationCap className="h-8 w-8 text-accent-foreground" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-primary-foreground md:text-6xl">
              CourseMatch Assist
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-primary-foreground/80 md:text-xl">
              Transfer credits with confidence. Upload your transcript and instantly see how your courses match across institutions.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Upload Zone */}
      <section className="py-20 px-6">
        <div className="mx-auto max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground">Upload Your Transcript</h2>
            <p className="mt-3 text-muted-foreground">Drag and drop your file or click to browse. We accept PDF and CSV formats.</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all duration-300 cursor-pointer ${
              isDragging ? "border-accent bg-accent/5 shadow-[0_0_20px_hsl(38_90%_55%/0.25)]" : "border-border bg-card hover:border-primary/40 hover:bg-secondary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
              {isDragging ? <FileText className="h-7 w-7 text-accent" /> : <Upload className="h-7 w-7 text-primary" />}
            </div>
            <p className="text-foreground font-medium">{isDragging ? "Drop it here!" : "Drag & drop your transcript"}</p>
            <p className="mt-1 text-sm text-muted-foreground">or</p>
            <Button className="mt-4 px-8">Browse Files</Button>
            <p className="mt-4 text-xs text-muted-foreground">Supports PDF, CSV • Max 10MB</p>
          </motion.div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-secondary/50 py-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-3xl font-bold text-foreground">
            How It Works
          </motion.h2>
          <p className="mt-3 text-muted-foreground">Three simple steps to transfer clarity</p>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                className="relative flex flex-col items-center rounded-2xl bg-card p-8 shadow-sm"
              >
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15">
                  <step.icon className="h-7 w-7 text-accent" />
                </div>
                <span className="absolute top-4 right-4 text-sm font-semibold text-muted-foreground/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8 px-6">
        <div className="mx-auto max-w-4xl flex flex-col items-center justify-between gap-4 md:flex-row">
          <p className="font-heading text-sm font-semibold text-foreground">CourseMatch Assist</p>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} CourseMatch Assist. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
