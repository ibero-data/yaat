"use client"

import * as React from "react"
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from "date-fns"
import { CalendarIcon, ChevronDown } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const presets = [
  {
    label: "Today",
    value: "today",
    getRange: (): DateRange => {
      const today = new Date()
      return { from: startOfDay(today), to: endOfDay(today) }
    },
  },
  {
    label: "Yesterday",
    value: "yesterday",
    getRange: (): DateRange => {
      const yesterday = subDays(new Date(), 1)
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
    },
  },
  {
    label: "Last 7 days",
    value: "last7days",
    getRange: (): DateRange => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 14 days",
    value: "last14days",
    getRange: (): DateRange => ({
      from: startOfDay(subDays(new Date(), 13)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 30 days",
    value: "last30days",
    getRange: (): DateRange => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 90 days",
    value: "last90days",
    getRange: (): DateRange => ({
      from: startOfDay(subDays(new Date(), 89)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "This month",
    value: "thisMonth",
    getRange: (): DateRange => ({
      from: startOfMonth(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last month",
    value: "lastMonth",
    getRange: (): DateRange => {
      const lastMonth = subMonths(new Date(), 1)
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
      }
    },
  },
]

interface DateRangePickerProps {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
  className?: string
  align?: "start" | "center" | "end"
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
  align = "end",
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedPreset, setSelectedPreset] = React.useState<string>("last7days")

  const handlePresetSelect = (preset: typeof presets[number]) => {
    setSelectedPreset(preset.value)
    onDateRangeChange(preset.getRange())
    setIsOpen(false)
  }

  const handleCalendarSelect = (range: DateRange | undefined) => {
    setSelectedPreset("custom")
    onDateRangeChange(range)
  }

  const formatDateRange = () => {
    if (!dateRange?.from) return "Select date range"
    if (!dateRange.to) return format(dateRange.from, "MMM d, yyyy")

    // Same month and year
    if (
      dateRange.from.getMonth() === dateRange.to.getMonth() &&
      dateRange.from.getFullYear() === dateRange.to.getFullYear()
    ) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "d, yyyy")}`
    }

    // Same year
    if (dateRange.from.getFullYear() === dateRange.to.getFullYear()) {
      return `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
    }

    return `${format(dateRange.from, "MMM d, yyyy")} - ${format(dateRange.to, "MMM d, yyyy")}`
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal min-w-[240px]",
            !dateRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="flex-1 truncate">{formatDateRange()}</span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r border-border p-2 space-y-1 max-w-[130px]">
            {presets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                  selectedPreset === preset.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
            <div className="border-t border-border my-2" />
            <button
              onClick={() => setSelectedPreset("custom")}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                selectedPreset === "custom"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              Custom
            </button>
          </div>

          {/* Calendar */}
          <div className="p-3">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              defaultMonth={dateRange?.from ? subMonths(dateRange.from, 0) : subMonths(new Date(), 1)}
              disabled={(date) => date > new Date()}
            />
          </div>
        </div>

        {/* Footer with apply button for custom ranges */}
        {selectedPreset === "custom" && (
          <div className="border-t border-border p-3 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={!dateRange?.from || !dateRange?.to}
            >
              Apply
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
