import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "./components/ui/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trao — Interview Preparation Platform",
  description:
    "Generate a personalized, AI-powered interview prep kit from any job description. Get tailored questions, flashcards, and a day-by-day study schedule.",
  keywords: [
    "interview preparation",
    "AI interview kit",
    "job description",
    "technical interview",
    "study schedule",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ height: "100%" }}
    >
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
