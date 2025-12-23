import { useState, useEffect, useRef, FormEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import ClickableMessage from '../components/ClickableMessage'
import { useTTS } from '../hooks/useTTS'
import { useSTT } from '../hooks/useSTT'
import api from '../services/api'
import type { ChatMessage, Chat as ChatType, GrammarAnalysis } from '../types'

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
  const { isRecording, isTranscribing, startRecording, stopRecording } = useSTT()
  const [grammarModal, setGrammarModal] = useState<{ analysis: GrammarAnalysis; message: string } | null>(null)

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

      // Update user message with grammar analysis
      const grammarAnalysis = response.data.grammar as GrammarAnalysis | undefined
      const updatedUserMessage: ChatMessage = {
        ...userMessage,
        grammar: grammarAnalysis,
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      }

      setMessages((prev) => [...prev.slice(0, -1), updatedUserMessage, assistantMessage])

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

  const handleMicClick = async () => {
    if (isRecording) {
      try {
        const text = await stopRecording()
        if (text.trim()) {
          setInput(text.trim())
          inputRef.current?.focus()
        }
      } catch (err) {
        console.error('STT error:', err)
      }
    } else {
      try {
        await startRecording()
      } catch (err) {
        console.error('Failed to start recording:', err)
      }
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
                    {msg.role === 'user' && msg.grammar && (
                      <button
                        className="btn btn-link p-0"
                        onClick={() => setGrammarModal({ analysis: msg.grammar!, message: msg.content })}
                        title="View grammar feedback"
                        style={{ fontSize: '1.2rem', lineHeight: 1 }}
                      >
                        {msg.grammar.score === 'perfect' ? (
                          <span style={{ color: '#4caf50' }}>&#10004;</span>
                        ) : msg.grammar.score === 'minor' ? (
                          <span style={{ color: '#ff9800' }}>&#9888;</span>
                        ) : (
                          <span style={{ color: '#f44336' }}>&#10008;</span>
                        )}
                      </button>
                    )}
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
                <button
                  type="button"
                  className={`btn ${isRecording ? 'btn-danger' : 'btn-outline-secondary'}`}
                  onClick={handleMicClick}
                  disabled={isSending || isTranscribing}
                  title={isRecording ? 'Stop recording' : 'Start voice input'}
                  style={{
                    fontSize: '1.2rem',
                    lineHeight: 1,
                    animation: isRecording ? 'pulse 1s infinite' : 'none',
                  }}
                >
                  {isTranscribing ? (
                    <span className="spinner-border spinner-border-sm" />
                  ) : (
                    <span>&#127908;</span>
                  )}
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  className="form-control"
                  placeholder={isRecording ? 'Listening...' : 'Type your message...'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isSending || isRecording}
                />
                <button type="submit" className="btn btn-primary" disabled={isSending || !input.trim() || isRecording}>
                  {isSending ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Grammar Feedback Modal */}
      {grammarModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setGrammarModal(null)}
        >
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title d-flex align-items-center gap-2">
                  {grammarModal.analysis.score === 'perfect' ? (
                    <span style={{ color: '#4caf50' }}>&#10004; Perfect!</span>
                  ) : grammarModal.analysis.score === 'minor' ? (
                    <span style={{ color: '#ff9800' }}>&#9888; Minor Issues</span>
                  ) : (
                    <span style={{ color: '#f44336' }}>&#10008; Needs Work</span>
                  )}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setGrammarModal(null)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3 p-2 bg-light rounded">
                  <small className="text-muted">Your message:</small>
                  <p className="mb-0">{grammarModal.message}</p>
                </div>

                {grammarModal.analysis.explanation && (
                  <p>{grammarModal.analysis.explanation}</p>
                )}

                {grammarModal.analysis.corrections && grammarModal.analysis.corrections.length > 0 && (
                  <div className="mt-3">
                    <h6>Corrections:</h6>
                    {grammarModal.analysis.corrections.map((correction, idx) => (
                      <div key={idx} className="mb-2 p-2 border rounded">
                        <div className="d-flex gap-2 align-items-center mb-1">
                          <span className="text-decoration-line-through text-danger">
                            {correction.original}
                          </span>
                          <span>→</span>
                          <span className="text-success fw-bold">{correction.corrected}</span>
                        </div>
                        <small className="text-muted">{correction.reason}</small>
                      </div>
                    ))}

                    {grammarModal.analysis.correctedSentence && (
                      <div className="mt-3 p-2 bg-success bg-opacity-10 border border-success rounded">
                        <small className="text-success fw-bold">Corrected sentence:</small>
                        <p className="mb-0 mt-1">{grammarModal.analysis.correctedSentence}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setGrammarModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
