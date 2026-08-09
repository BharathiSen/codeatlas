"use client"

import React, { useEffect, useState } from 'react'
import { cn } from "@/lib/utils"

interface AnimatedTextProps {
  text: string
  className?: string
  speed?: number
  delay?: number
  onComplete?: () => void
  showCursor?: boolean
  /** Styling for the trailing caret. Defaults to a bar in the current text colour. */
  cursorClassName?: string
}

export function AnimatedText({
  text,
  className,
  speed = 50,
  delay = 0,
  onComplete,
  showCursor = true,
  cursorClassName,
}: AnimatedTextProps) {
  const [displayText, setDisplayText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  
  useEffect(() => {
    let timeout: NodeJS.Timeout
    let currentIndex = 0
    
    // Reset if text changes
    setDisplayText('')
    setIsComplete(false)
    
    // Initial delay before starting animation
    timeout = setTimeout(() => {
      const intervalId = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayText(text.substring(0, currentIndex + 1))
          currentIndex++
        } else {
          clearInterval(intervalId)
          setIsComplete(true)
          if (onComplete) onComplete()
        }
      }, speed)
      
      return () => clearInterval(intervalId)
    }, delay)
    
    return () => clearTimeout(timeout)
  }, [text, speed, delay, onComplete])

  return (
    <span className={cn("inline-block align-bottom", className)}>
      {displayText}
      {!isComplete && showCursor && (
        <span
          aria-hidden="true"
          className={cn(
            "inline-block w-[0.5ch] translate-y-[0.08em] bg-current animate-pulse",
            cursorClassName ?? "h-[0.85em]"
          )}
        />
      )}
    </span>
  )
}