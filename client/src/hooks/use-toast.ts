import * as React from "react"
import { useLocation } from "wouter"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"
import { ToastAction } from "@/components/ui/toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  link?: string
  projectId?: string
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

// Global navigation function for toasts
let globalNavigate: ((to: string) => void) | null = null;

function setGlobalNavigate(navigate: (to: string) => void) {
  globalNavigate = navigate;
}

function buildProjectAwareLink(link: string, projectId?: string): string {
  if (!link || !projectId) return link || '#';
  
  // Check for external URLs (protocol scheme like http:, https:, mailto:, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(link)) return link;
  
  // If link is already absolute (starts with /projects/), use as-is
  if (link.startsWith('/projects/')) return link;
  
  // Handle hash fragments
  if (link.startsWith('#')) return `/projects/${projectId}${link}`;
  
  // If link is relative (starts with /), prepend project context
  if (link.startsWith('/')) return `/projects/${projectId}${link}`;
  
  // If link is just a path fragment, build full project path
  return `/projects/${projectId}/${link}`;
}

function toast({ link, projectId, action, ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  // Auto-create action for clickable links
  let toastAction = action;
  if (link && !action) {
    const targetUrl = buildProjectAwareLink(link, projectId);
    const isExternal = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetUrl);
    
    toastAction = React.createElement(ToastAction, {
      altText: "Open",
      onClick: () => {
        if (isExternal) {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        } else if (globalNavigate) {
          globalNavigate(targetUrl);
        }
        dismiss();
      }
    }, "Open");
  }

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      link,
      projectId,
      action: toastAction,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  const [, navigate] = useLocation()

  React.useEffect(() => {
    listeners.push(setState)
    // Set the global navigate function for toasts
    setGlobalNavigate(navigate)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state, navigate])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast, setGlobalNavigate, buildProjectAwareLink }
