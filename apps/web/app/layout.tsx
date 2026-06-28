import type { ReactNode } from "react";
import { APP_NAME } from "@productivity/shared";
import "./globals.css";

export const metadata = {
  title: {
    default: APP_NAME,
    template: `${APP_NAME} | %s`,
  },
};

// Runs before first paint: applies a saved manual theme by setting data-theme on
// <html>, so there's no flash of the wrong appearance on reload. No saved value
// (or "system") leaves the attribute off, letting prefers-color-scheme decide.
const themeScript = `(function(){try{var p=localStorage.getItem('theme-preference');if(p==='light'||p==='dark'){document.documentElement.setAttribute('data-theme',p);}else{document.documentElement.removeAttribute('data-theme');}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
