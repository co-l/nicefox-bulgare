import { useState, useEffect, useRef, FormEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ClickableMessage from '../components/ClickableMessage'
import { useTTS } from '../hooks/useTTS'
import api from '../services/api'
import type { ChatMessage, Chat as ChatType } from '../types'

export default function Chat() {
  const { chatId } = useParams()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatHistory, setChatHistory] = useState<ChatType[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const [autoRead, setAutoRead] = useState(() => {
    const saved = localStorage.getItem('autoRead')
    return saved !== null ? saved === 'true' : true
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { isLoading: ttsLoading, isPlaying, speak, stop } = useTTS()

  const toggleAutoRead = useCallback(() => {
    setAutoRead(prev => {
      const newValue = !prev
      localStorage.setItem('autoRead', String(newValue))
      return newValue
    })
  }, [])

  useEffect(() => {
    fetchChatHistory()
    if (chatId) {
      fetchChat(chatId)
    } else {
      setMessages([])
    }
  }, [chatId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when sending completes or loading finishes
  useEffect(() => {
    if (!isSending && !isLoading) {
      inputRef.current?.focus()
    }
  }, [isSending, isLoading])

  const fetchChatHistory = async () => {
    try {
      const response = await api.get('/chat/history')
      setChatHistory(response.data.chats || [])
    } catch (err) {
      console.error('Failed to fetch chat history:', err)
    }
  }

  const fetchChat = async (id: string) => {
    setIsLoading(true)
    try {
      const response = await api.get(`/chat/${id}`)
      setMessages(response.data.messages || [])
    } catch (err) {
      console.error('Failed to fetch chat:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSending) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsSending(true)

    try {
      const response = await api.post('/chat', {
        chatId: chatId || undefined,
        message: userMessage.content,
      })

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Auto-read the new message (after state update)
      if (autoRead) {
        const newIdx = messages.length + 1 // +1 for user msg, +1 for assistant = current length + 1
        setPlayingIdx(newIdx)
        speak(assistantMessage.content).then(() => setPlayingIdx(null))
      }

      if (!chatId && response.data.chatId) {
        navigate(`/chat/${response.data.chatId}`, { replace: true })
      }

      await fetchChatHistory()
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const startNewChat = async () => {
    setIsLoading(true)
    setMessages([])
    try {
      const response = await api.post('/chat/start')
      const newMessages = response.data.messages || []
      setMessages(newMessages)
      navigate(`/chat/${response.data.chatId}`, { replace: true })
      await fetchChatHistory()

      // Auto-read the greeting message
      if (autoRead && newMessages.length > 0) {
        const lastMsg = newMessages[newMessages.length - 1]
        if (lastMsg.role === 'assistant') {
          setPlayingIdx(newMessages.length - 1)
          speak(lastMsg.content).then(() => setPlayingIdx(null))
        }
      }
    } catch (err) {
      console.error('Failed to start chat:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTTS = async (text: string, idx: number) => {
    if (isPlaying && playingIdx === idx) {
      stop()
      setPlayingIdx(null)
    } else {
      setPlayingIdx(idx)
      await speak(text)
      setPlayingIdx(null)
    }
  }

  return (
    <>
      <Navbar />
      <div className="container-fluid" style={{ height: 'calc(100vh - 56px)' }}>
        <div className="row h-100">
          <div className="col-md-3 border-end bg-light p-0">
            <div className="p-3 border-bottom">
              <button className="btn btn-primary w-100" onClick={startNewChat}>
                New Conversation
              </button>
            </div>
            <div className="overflow-auto" style={{ height: 'calc(100% - 70px)' }}>
              {chatHistory.map((chat) => (
                <div
                  key={chat.id}
                  className={`p-3 border-bottom cursor-pointer ${chatId === chat.id ? 'bg-white' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                >
                  <small className="text-muted">
                    {new Date(chat.createdAt).toLocaleDateString()}
                  </small>
                  <p className="mb-0 text-truncate">
                    {chat.messages?.[0]?.content || 'New conversation'}
                  </p>
                </div>
              ))}
              {chatHistory.length === 0 && (
                <p className="text-muted text-center mt-4">No conversations yet</p>
              )}
            </div>
          </div>

          <div className="col-md-9 d-flex flex-column p-0">
            <div className="border-bottom p-2 d-flex justify-content-end align-items-center gap-2">
              <label className="form-check-label small text-muted" htmlFor="autoRead">
                Auto-read
              </label>
              <div className="form-check form-switch m-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="autoRead"
                  checked={autoRead}
                  onChange={toggleAutoRead}
                />
              </div>
            </div>
            <div className="flex-grow-1 overflow-auto p-4">
              {isLoading ? (
                <div className="text-center">
                  <div className="spinner-border" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center mt-5">
                  <h4 className="text-muted mb-3">Ready to practice?</h4>
                  <button className="btn btn-primary btn-lg" onClick={startNewChat}>
                    Start Conversation
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`mb-3 d-flex align-items-center gap-2 ${msg.role === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
                  >
                    <div
                      className={`p-3 rounded-3 ${
                        msg.role === 'user' ? 'bg-primary text-white' : 'bg-light'
                      }`}
                      style={{ maxWidth: '70%' }}
                    >
                      <ClickableMessage content={msg.content} isAssistant={msg.role === 'assistant'} />
                    </div>
                    {msg.role === 'assistant' && (
                      <button
                        className="btn btn-link p-0 text-secondary"
                        onClick={() => handleTTS(msg.content, idx)}
                        disabled={ttsLoading && playingIdx === idx}
                        title={isPlaying && playingIdx === idx ? 'Pause' : 'Play'}
                        style={{ fontSize: '1.2rem', lineHeight: 1 }}
                      >
                        {ttsLoading && playingIdx === idx ? (
                          <span className="spinner-border spinner-border-sm" />
                        ) : isPlaying && playingIdx === idx ? (
                          <>&#10074;&#10074;</>
                        ) : (
                          <>&#9658;</>
                        )}
                      </button>
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-top p-3">
              <form onSubmit={handleSubmit} className="d-flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  className="form-control"
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isSending}
                />
                <button type="submit" className="btn btn-primary" disabled={isSending || !input.trim()}>
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
