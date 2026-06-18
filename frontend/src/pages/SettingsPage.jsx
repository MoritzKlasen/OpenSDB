import React, { useState, useEffect } from 'react'
import { settingsApi } from '../utils/api'
import { useWebSocket } from '../hooks/useWebSocket'
import Layout from '../components/Layout'
import { Button, Error } from '../components/UI'
import Icon from '../components/Icon'

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'de', name: 'German' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'it', name: 'Italian' },
    { code: 'tr', name: 'Turkish' },
    { code: 'zh', name: 'Chinese Simplified' },
]

const SENSITIVITY_LEVELS = [
    { value: 'low', name: 'Low', description: 'Fewer false positives, may miss some scams' },
    { value: 'medium', name: 'Medium', description: 'Balanced detection' },
    { value: 'high', name: 'High', description: 'More aggressive, may have false positives' },
]

const DETECTION_MODES = [
    { value: 'default', name: 'Rule-based', description: 'Fast, keyword-based detection' },
    { value: 'ai', name: 'AI (Machine Learning)', description: 'Advanced detection using AI models' },
]

// Collapsible Section Component
const CollapsibleSection = ({ title, icon, children, isOpen, onToggle }) => {
    return (
        <div className="border border-slate-700 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                type="button"
                className="w-full flex items-center justify-between px-6 py-4 bg-slate-800 hover:bg-slate-750 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {icon && <Icon name={icon} className="w-5 h-5" />}
                    <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                </div>
                <svg
                    className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {isOpen && (
                <div className="p-6 bg-slate-900">
                    {children}
                </div>
            )}
        </div>
    )
}

const SettingsPage = () => {
    const [activeTab, setActiveTab] = useState('general')
    const [settings, setSettings] = useState(null)
    const [bannedWords, setBannedWords] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)
    const [success, setSuccess] = useState(null)
    const [newWord, setNewWord] = useState('')
    const [newDomain, setNewDomain] = useState('')
    const [newUserId, setNewUserId] = useState('')
    const [useMultiModel, setUseMultiModel] = useState(false)

    // State for collapsible sections with localStorage persistence
    const [sectionsOpen, setSectionsOpen] = useState(() => {
        const saved = localStorage.getItem('settingsPageSectionsOpen')
        if (saved) {
            try {
                return JSON.parse(saved)
            } catch {
                // Fall back to defaults if parsing fails
            }
        }
        return {
            'language-localization': true,
            'discord-roles': true,
            'notification-channels': true,
            'detection-status': true,
            'detection-mode-sensitivity': true,
            'alert-channel': true,
            'automatic-actions': true,
            'whitelist-management': false,
            'advanced-settings': false,
            'ai-configuration': false,
            'add-banned-word': true,
            'banned-words-list': true,
        }
    })

    // Save sections state to localStorage whenever it changes
    useEffect(() => {
        localStorage.setItem('settingsPageSectionsOpen', JSON.stringify(sectionsOpen))
    }, [sectionsOpen])

    const toggleSection = (sectionId) => {
        setSectionsOpen(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId]
        }))
    }

    const fetchSettings = async () => {
        try {
            setLoading(true)
            const [settingsRes, wordsRes] = await Promise.all([
                settingsApi.getServerSettings(),
                settingsApi.getBannedWords(),
            ])
            setSettings(settingsRes.data)
            setBannedWords(wordsRes.data)
            setError(null)
        } catch (err) {
            setError('Failed to load settings')
        } finally {
            setLoading(false)
        }
    }

    const refreshSettings = async () => {
        try {
            const [settingsRes, wordsRes] = await Promise.all([
                settingsApi.getServerSettings(),
                settingsApi.getBannedWords(),
            ])
            setSettings(settingsRes.data)
            setBannedWords(wordsRes.data)
            setError(null)
        } catch (err) {
            // Silent fail on background refresh
        }
    }

    useEffect(() => {
        fetchSettings()
        const interval = setInterval(refreshSettings, 15000)
        return () => clearInterval(interval)
    }, [])

    useWebSocket((eventType, data) => {
        if (eventType === 'settings-updated') {
            refreshSettings()
            if (data.type === 'banned-words') {
                setSuccess(`Banned word ${data.action === 'add' ? 'added' : 'removed'}`)
            } else {
                setSuccess('Settings updated')
            }
            setTimeout(() => setSuccess(null), 3000)
        }
    })

    const handleSaveGeneral = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const updates = {
                language: settings.language,
                adminChannelId: settings.adminChannelId,
                teamRoleId: settings.teamRoleId,
                verifiedRoleId: settings.verifiedRoleId,
                onJoinRoleId: settings.onJoinRoleId,
            }
            const res = await settingsApi.updateServerSettings(updates)
            setSettings(res.data)
            setSuccess('General settings saved successfully')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError('Failed to save general settings')
        } finally {
            setSaving(false)
        }
    }

    const handleSaveAntiScam = async (e) => {
        e.preventDefault()
        setSaving(true)
        setError(null)
        setSuccess(null)
        try {
            const updates = {
                scamDetectionConfig: settings.scamDetectionConfig,
            }
            const res = await settingsApi.updateServerSettings(updates)
            setSettings(res.data)
            setSuccess('Anti-scam settings saved successfully')
            setTimeout(() => setSuccess(null), 3000)
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save anti-scam settings')
        } finally {
            setSaving(false)
        }
    }

    const handleAddWord = async (e) => {
        e.preventDefault()
        if (!newWord.trim()) return

        try {
            await settingsApi.addBannedWord(newWord.trim())
            setNewWord('')
            setSuccess('Word added successfully')
            setTimeout(() => setSuccess(null), 3000)
            refreshSettings()
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add word')
        }
    }

    const handleRemoveWord = async (word) => {
        try {
            await settingsApi.removeBannedWord(word)
            setSuccess('Word removed successfully')
            setTimeout(() => setSuccess(null), 3000)
            refreshSettings()
        } catch (err) {
            setError('Failed to remove word')
        }
    }

    const handleAddDomain = () => {
        if (!newDomain.trim()) return
        const currentDomains = settings.scamDetectionConfig?.trustedDomains || []
        if (currentDomains.includes(newDomain.trim())) {
            setError('Domain already whitelisted')
            setTimeout(() => setError(null), 3000)
            return
        }
        setSettings({
            ...settings,
            scamDetectionConfig: {
                ...settings.scamDetectionConfig,
                trustedDomains: [...currentDomains, newDomain.trim()]
            }
        })
        setNewDomain('')
    }

    const handleRemoveDomain = (domain) => {
        const currentDomains = settings.scamDetectionConfig?.trustedDomains || []
        setSettings({
            ...settings,
            scamDetectionConfig: {
                ...settings.scamDetectionConfig,
                trustedDomains: currentDomains.filter(d => d !== domain)
            }
        })
    }

    const handleAddUserId = () => {
        if (!newUserId.trim()) return
        const currentUsers = settings.scamDetectionConfig?.trustedUserIds || []
        if (currentUsers.includes(newUserId.trim())) {
            setError('User ID already whitelisted')
            setTimeout(() => setError(null), 3000)
            return
        }
        setSettings({
            ...settings,
            scamDetectionConfig: {
                ...settings.scamDetectionConfig,
                trustedUserIds: [...currentUsers, newUserId.trim()]
            }
        })
        setNewUserId('')
    }

    const handleRemoveUserId = (userId) => {
        const currentUsers = settings.scamDetectionConfig?.trustedUserIds || []
        setSettings({
            ...settings,
            scamDetectionConfig: {
                ...settings.scamDetectionConfig,
                trustedUserIds: currentUsers.filter(u => u !== userId)
            }
        })
    }

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <svg className="animate-spin h-12 w-12 mx-auto mb-4 text-blue-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <p className="text-slate-300">Loading settings...</p>
                    </div>
                </div>
            </Layout>
        )
    }

    if (!settings) {
        return (
            <Layout>
                <Error message="Failed to load settings" />
            </Layout>
        )
    }

    return (
        <Layout>
            <div className="space-y-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-lg p-6 border border-slate-700">
                    <h2 className="text-3xl font-bold text-slate-100 mb-2">Bot Configuration</h2>
                    <p className="text-slate-400">Manage all bot settings and features from this centralized dashboard</p>
                </div>

                {/* Status Messages */}
                {error && <Error message={error} />}
                {success && (
                    <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg flex items-center gap-2">
                        <Icon name="checkCircle" className="w-5 h-5" />
                        {success}
                    </div>
                )}

                {/* Tabs */}
                <div className="bg-slate-900 rounded-lg border border-slate-700">
                    <nav className="flex gap-1 p-1">
                        <button
                            onClick={() => setActiveTab('general')}
                            type="button"
                            className={`flex-1 px-4 py-3 font-medium rounded-md transition-all ${activeTab === 'general'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <Icon name="settings" className="w-5 h-5" />
                                General
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('antiscam')}
                            type="button"
                            className={`flex-1 px-4 py-3 font-medium rounded-md transition-all ${activeTab === 'antiscam'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <Icon name="shield" className="w-5 h-5" />
                                Anti-Scam
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('words')}
                            type="button"
                            className={`flex-1 px-4 py-3 font-medium rounded-md transition-all ${activeTab === 'words'
                                ? 'bg-blue-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <Icon name="ban" className="w-5 h-5" />
                                Banned Words
                            </span>
                        </button>
                    </nav>
                </div>

                {/* General Settings Tab */}
                {activeTab === 'general' && (
                    <form onSubmit={handleSaveGeneral} className="space-y-4">
                        <CollapsibleSection title="Language & Localization" icon="globe" isOpen={sectionsOpen['language-localization']} onToggle={() => toggleSection('language-localization')}>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Bot Language
                                </label>
                                <select
                                    value={settings.language}
                                    onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                                    className="w-full max-w-md px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {LANGUAGES.map((lang) => (
                                        <option key={lang.code} value={lang.code}>
                                            {lang.name}
                                        </option>
                                    ))}
                                </select>
                                <p className="mt-2 text-sm text-slate-400">
                                    All bot responses will be in this language
                                </p>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Discord Roles" icon="users" isOpen={sectionsOpen['discord-roles']} onToggle={() => toggleSection('discord-roles')}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Team Role ID
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.teamRoleId || ''}
                                        onChange={(e) => setSettings({ ...settings, teamRoleId: e.target.value })}
                                        placeholder="123456789012345678"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="mt-1 text-sm text-slate-400">
                                        Members with this role can manage bot settings
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Verified Role ID
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.verifiedRoleId || ''}
                                        onChange={(e) => setSettings({ ...settings, verifiedRoleId: e.target.value })}
                                        placeholder="123456789012345678"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="mt-1 text-sm text-slate-400">
                                        Role automatically assigned to verified users
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        On Join Role ID
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.onJoinRoleId || ''}
                                        onChange={(e) => setSettings({ ...settings, onJoinRoleId: e.target.value })}
                                        placeholder="123456789012345678"
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <p className="mt-1 text-sm text-slate-400">
                                        Role automatically assigned when members join the server
                                    </p>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Notification Channels" icon="bell" isOpen={sectionsOpen['notification-channels']} onToggle={() => toggleSection('notification-channels')}>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Admin Channel ID
                                </label>
                                <input
                                    type="text"
                                    value={settings.adminChannelId || ''}
                                    onChange={(e) => setSettings({ ...settings, adminChannelId: e.target.value })}
                                    placeholder="123456789012345678"
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="mt-1 text-sm text-slate-400">
                                    Channel for admin notifications and moderation alerts
                                </p>
                            </div>
                        </CollapsibleSection>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={saving}>
                                {saving ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Saving...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Icon name="save" className="w-4 h-4" />
                                        Save General Settings
                                    </span>
                                )}
                            </Button>
                        </div>
                    </form>
                )}

                {/* Anti-Scam Settings Tab */}
                {activeTab === 'antiscam' && (
                    <form onSubmit={handleSaveAntiScam} className="space-y-4">
                        <CollapsibleSection title="Detection Status" icon="shield" isOpen={sectionsOpen['detection-status']} onToggle={() => toggleSection('detection-status')}>
                            <div className="space-y-4">
                                <label className="flex items-center gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750">
                                    <input
                                        type="checkbox"
                                        checked={settings.scamDetectionConfig?.enabled || false}
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                scamDetectionConfig: {
                                                    ...settings.scamDetectionConfig,
                                                    enabled: e.target.checked,
                                                },
                                            })
                                        }
                                        className="w-5 h-5 bg-slate-700 border-slate-600 rounded"
                                    />
                                    <div>
                                        <span className="text-lg font-semibold text-slate-100 block">
                                            Enable Anti-Scam Detection
                                        </span>
                                        <span className="text-sm text-slate-400">
                                            Automatically detect and respond to potential scam messages
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Detection Mode & Sensitivity" icon="lightning" isOpen={sectionsOpen['detection-mode-sensitivity']} onToggle={() => toggleSection('detection-mode-sensitivity')}>
                            <div className="space-y-6">
                                <div>
                                    <h4 className="text-md font-semibold text-slate-200 mb-3">Detection Mode</h4>
                                    <div className="space-y-2">
                                        {DETECTION_MODES.map((mode) => (
                                            <label
                                                key={mode.value}
                                                className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750"
                                            >
                                                <input
                                                    type="radio"
                                                    name="mode"
                                                    value={mode.value}
                                                    checked={settings.scamDetectionConfig?.mode === mode.value}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                mode: e.target.value,
                                                            },
                                                        })
                                                    }
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="text-slate-100 font-medium">{mode.name}</div>
                                                    <div className="text-sm text-slate-400">{mode.description}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-slate-700 pt-6">
                                    <h4 className="text-md font-semibold text-slate-200 mb-3">Sensitivity Level</h4>
                                    <div className="space-y-2">
                                        {SENSITIVITY_LEVELS.map((level) => (
                                            <label
                                                key={level.value}
                                                className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750"
                                            >
                                                <input
                                                    type="radio"
                                                    name="sensitivity"
                                                    value={level.value}
                                                    checked={settings.scamDetectionConfig?.sensitivity === level.value}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                sensitivity: e.target.value,
                                                            },
                                                        })
                                                    }
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="text-slate-100 font-medium">{level.name}</div>
                                                    <div className="text-sm text-slate-400">{level.description}</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Alert Channel" icon="bell" isOpen={sectionsOpen['alert-channel']} onToggle={() => toggleSection('alert-channel')}>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    Alert Channel ID
                                </label>
                                <input
                                    type="text"
                                    value={settings.scamDetectionConfig?.alertChannelId || ''}
                                    onChange={(e) =>
                                        setSettings({
                                            ...settings,
                                            scamDetectionConfig: {
                                                ...settings.scamDetectionConfig,
                                                alertChannelId: e.target.value,
                                            },
                                        })
                                    }
                                    placeholder="123456789012345678"
                                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <p className="mt-1 text-sm text-slate-400">
                                    Channel where scam detection alerts will be sent
                                </p>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Automatic Actions" icon="lightning" isOpen={sectionsOpen['automatic-actions']} onToggle={() => toggleSection('automatic-actions')}>
                            <div className="space-y-4">
                                <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750">
                                    <input
                                        type="checkbox"
                                        checked={settings.scamDetectionConfig?.autoDelete || false}
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                scamDetectionConfig: {
                                                    ...settings.scamDetectionConfig,
                                                    autoDelete: e.target.checked,
                                                },
                                            })
                                        }
                                        className="w-5 h-5 bg-slate-700 border-slate-600 rounded mt-0.5"
                                    />
                                    <div>
                                        <span className="text-slate-100 font-medium block">Auto-Delete Scam Messages</span>
                                        <span className="text-sm text-slate-400">
                                            Automatically delete messages identified as scams
                                        </span>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750">
                                    <input
                                        type="checkbox"
                                        checked={settings.scamDetectionConfig?.autoTimeout || false}
                                        onChange={(e) =>
                                            setSettings({
                                                ...settings,
                                                scamDetectionConfig: {
                                                    ...settings.scamDetectionConfig,
                                                    autoTimeout: e.target.checked,
                                                },
                                            })
                                        }
                                        className="w-5 h-5 bg-slate-700 border-slate-600 rounded mt-0.5"
                                    />
                                    <div className="flex-1">
                                        <span className="text-slate-100 font-medium block">Auto-Timeout Users</span>
                                        <span className="text-sm text-slate-400 block mb-3">
                                            Automatically timeout users who post scam messages
                                        </span>
                                        {settings.scamDetectionConfig?.autoTimeout && (
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Timeout Duration (minutes)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="40320"
                                                    value={settings.scamDetectionConfig?.autoTimeoutDuration || 60}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                autoTimeoutDuration: parseInt(e.target.value, 10),
                                                            },
                                                        })
                                                    }
                                                    className="w-32 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </label>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Whitelist Management" icon="check" isOpen={sectionsOpen['whitelist-management']} onToggle={() => toggleSection('whitelist-management')}>
                            <div className="space-y-6">
                                {/* Trusted Domains */}
                                <div>
                                    <h4 className="text-md font-semibold text-slate-200 mb-3">Trusted Domains</h4>
                                    <p className="text-sm text-slate-400 mb-3">
                                        Messages containing these domains will not be flagged as scams
                                    </p>
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={newDomain}
                                            onChange={(e) => setNewDomain(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDomain())}
                                            placeholder="example.com"
                                            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <Button
                                            type="button"
                                            onClick={handleAddDomain}
                                            disabled={!newDomain.trim()}
                                            variant="secondary"
                                        >
                                            Add Domain
                                        </Button>
                                    </div>
                                    {(settings.scamDetectionConfig?.trustedDomains || []).length > 0 ? (
                                        <div className="space-y-2">
                                            {(settings.scamDetectionConfig?.trustedDomains || []).map((domain) => (
                                                <div
                                                    key={domain}
                                                    className="flex items-center justify-between bg-slate-800 px-4 py-2 rounded-lg"
                                                >
                                                    <span className="text-slate-300">{domain}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveDomain(domain)}
                                                        className="text-red-400 hover:text-red-300 text-sm font-medium"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 italic">No trusted domains configured</p>
                                    )}
                                </div>

                                {/* Trusted Users */}
                                <div className="border-t border-slate-700 pt-6">
                                    <h4 className="text-md font-semibold text-slate-200 mb-3">Whitelisted Users</h4>
                                    <p className="text-sm text-slate-400 mb-3">
                                        Messages from these users will bypass scam detection
                                    </p>
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text"
                                            value={newUserId}
                                            onChange={(e) => setNewUserId(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddUserId())}
                                            placeholder="User ID (123456789012345678)"
                                            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <Button
                                            type="button"
                                            onClick={handleAddUserId}
                                            disabled={!newUserId.trim()}
                                            variant="secondary"
                                        >
                                            Add User
                                        </Button>
                                    </div>
                                    {(settings.scamDetectionConfig?.trustedUserIds || []).length > 0 ? (
                                        <div className="space-y-2">
                                            {(settings.scamDetectionConfig?.trustedUserIds || []).map((userId) => (
                                                <div
                                                    key={userId}
                                                    className="flex items-center justify-between bg-slate-800 px-4 py-2 rounded-lg"
                                                >
                                                    <span className="text-slate-300 font-mono text-sm">{userId}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveUserId(userId)}
                                                        className="text-red-400 hover:text-red-300 text-sm font-medium"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 italic">No whitelisted users configured</p>
                                    )}
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Advanced Settings" icon="wrench" isOpen={sectionsOpen['advanced-settings']} onToggle={() => toggleSection('advanced-settings')}>
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Min Risk Score for Alert
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={settings.scamDetectionConfig?.minRiskScoreForAlert || 45}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            minRiskScoreForAlert: parseInt(e.target.value, 10),
                                                        },
                                                    })
                                                }
                                                className="w-24 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <span className="text-slate-400 text-sm">/ 100</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Minimum score to send an alert to admins
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Min Risk Score for Auto-Action
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={settings.scamDetectionConfig?.minRiskScoreForAutoAction || 80}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            minRiskScoreForAutoAction: parseInt(e.target.value, 10),
                                                        },
                                                    })
                                                }
                                                className="w-24 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <span className="text-slate-400 text-sm">/ 100</span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500">
                                            Minimum score to trigger auto-delete/timeout
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-slate-700 pt-6">
                                    <h4 className="text-md font-semibold text-slate-200 mb-4">Duplicate Message Detection</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Duplicate Threshold
                                            </label>
                                            <input
                                                type="number"
                                                min="2"
                                                max="50"
                                                value={settings.scamDetectionConfig?.duplicateMessageThreshold || 3}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            duplicateMessageThreshold: parseInt(e.target.value, 10),
                                                        },
                                                    })
                                                }
                                                className="w-24 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <p className="mt-1 text-xs text-slate-500">
                                                Number of identical messages to flag as spam
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Time Window (minutes)
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="60"
                                                value={settings.scamDetectionConfig?.duplicateTimeWindow || 2}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            duplicateTimeWindow: parseInt(e.target.value, 10),
                                                        },
                                                    })
                                                }
                                                className="w-24 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            <p className="mt-1 text-xs text-slate-500">
                                                Time frame to check for duplicates
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-slate-700 pt-6">
                                    <h4 className="text-md font-semibold text-slate-200 mb-4">Account Age Requirements</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300 mb-2">
                                            Minimum Account Age (days)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="365"
                                            value={settings.scamDetectionConfig?.accountAgeRequirement || 7}
                                            onChange={(e) =>
                                                setSettings({
                                                    ...settings,
                                                    scamDetectionConfig: {
                                                        ...settings.scamDetectionConfig,
                                                        accountAgeRequirement: parseInt(e.target.value, 10),
                                                    },
                                                })
                                            }
                                            className="w-32 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <p className="mt-1 text-xs text-slate-500">
                                            New accounts younger than this are flagged as suspicious
                                        </p>
                                    </div>

                                    <label className="flex items-start gap-3 p-4 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-750 mt-4">
                                        <input
                                            type="checkbox"
                                            checked={settings.scamDetectionConfig?.firstMessageSuspicion !== false}
                                            onChange={(e) =>
                                                setSettings({
                                                    ...settings,
                                                    scamDetectionConfig: {
                                                        ...settings.scamDetectionConfig,
                                                        firstMessageSuspicion: e.target.checked,
                                                    },
                                                })
                                            }
                                            className="w-5 h-5 bg-slate-700 border-slate-600 rounded mt-0.5"
                                        />
                                        <div>
                                            <span className="text-slate-100 font-medium block">Flag First Messages</span>
                                            <span className="text-sm text-slate-400">
                                                Treat the first message from new users with extra suspicion
                                            </span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="AI Configuration" icon="chip" isOpen={sectionsOpen['ai-configuration']} onToggle={() => toggleSection('ai-configuration')}>
                            <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4 mb-6">
                                <p className="text-blue-300 text-sm flex items-start gap-2">
                                    <Icon name="alert" className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-400" />
                                    <span>Advanced users only: Configure AI/LLM engines for enhanced scam detection. These settings are only used when "AI (Machine Learning)" detection mode is selected above. Requires API access to OpenAI, Anthropic, or compatible services.</span>
                                </p>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={!useMultiModel}
                                            onChange={() => setUseMultiModel(false)}
                                        />
                                        <span className="text-slate-300">Single Model Configuration</span>
                                    </label>
                                    <label className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={useMultiModel}
                                            onChange={() => setUseMultiModel(true)}
                                        />
                                        <span className="text-slate-300">Multi-Model (Text + Vision)</span>
                                    </label>
                                </div>

                                {!useMultiModel ? (
                                    <div className="space-y-4 p-4 bg-slate-800 rounded-lg">
                                        <h5 className="font-semibold text-slate-200">Single Model Configuration</h5>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Provider
                                            </label>
                                            <input
                                                type="text"
                                                value={settings.scamDetectionConfig?.aiSettings?.provider || ''}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            aiSettings: {
                                                                ...settings.scamDetectionConfig?.aiSettings,
                                                                provider: e.target.value,
                                                            },
                                                        },
                                                    })
                                                }
                                                placeholder="openai, anthropic, etc."
                                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Model
                                            </label>
                                            <input
                                                type="text"
                                                value={settings.scamDetectionConfig?.aiSettings?.model || ''}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            aiSettings: {
                                                                ...settings.scamDetectionConfig?.aiSettings,
                                                                model: e.target.value,
                                                            },
                                                        },
                                                    })
                                                }
                                                placeholder="gpt-4, claude-3-opus, etc."
                                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                Base URL
                                            </label>
                                            <input
                                                type="text"
                                                value={settings.scamDetectionConfig?.aiSettings?.baseUrl || ''}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            aiSettings: {
                                                                ...settings.scamDetectionConfig?.aiSettings,
                                                                baseUrl: e.target.value,
                                                            },
                                                        },
                                                    })
                                                }
                                                placeholder="https://api.openai.com/v1"
                                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                                API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={settings.scamDetectionConfig?.aiSettings?.apiKey === '***HIDDEN***' ? '' : (settings.scamDetectionConfig?.aiSettings?.apiKey || '')}
                                                onChange={(e) =>
                                                    setSettings({
                                                        ...settings,
                                                        scamDetectionConfig: {
                                                            ...settings.scamDetectionConfig,
                                                            aiSettings: {
                                                                ...settings.scamDetectionConfig?.aiSettings,
                                                                apiKey: e.target.value,
                                                            },
                                                        },
                                                    })
                                                }
                                                placeholder={settings.scamDetectionConfig?.aiSettings?.apiKey === '***HIDDEN***' ? 'API key is set (hidden)' : 'sk-...'}
                                                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                            {settings.scamDetectionConfig?.aiSettings?.apiKey === '***HIDDEN***' && (
                                                <p className="mt-1 text-xs text-slate-400">API key is set and hidden. Enter a new key only to replace it.</p>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-4 p-4 bg-slate-800 rounded-lg">
                                            <h5 className="font-semibold text-slate-200">Text Model Configuration</h5>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Text Provider
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.textModel?.provider || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    textModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.textModel,
                                                                        provider: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="openai, anthropic, etc."
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Text Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.textModel?.model || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    textModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.textModel,
                                                                        model: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="gpt-4-turbo"
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Text Base URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.textModel?.baseUrl || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    textModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.textModel,
                                                                        baseUrl: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="https://api.openai.com/v1"
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Text API Key
                                                </label>
                                                <input
                                                    type="password"
                                                    value={settings.scamDetectionConfig?.aiSettings?.textModel?.apiKey === '***HIDDEN***' ? '' : (settings.scamDetectionConfig?.aiSettings?.textModel?.apiKey || '')}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    textModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.textModel,
                                                                        apiKey: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder={settings.scamDetectionConfig?.aiSettings?.textModel?.apiKey === '***HIDDEN***' ? 'Text API key is set (hidden)' : 'sk-...'}
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                {settings.scamDetectionConfig?.aiSettings?.textModel?.apiKey === '***HIDDEN***' && (
                                                    <p className="mt-1 text-xs text-slate-400">Text API key is set and hidden. Enter a new key only to replace it.</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-4 p-4 bg-slate-800 rounded-lg">
                                            <h5 className="font-semibold text-slate-200">Vision Model Configuration</h5>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Vision Provider
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.visionModel?.provider || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    visionModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.visionModel,
                                                                        provider: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="openai, anthropic, etc."
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Vision Model
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.visionModel?.model || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    visionModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.visionModel,
                                                                        model: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="gpt-4-vision"
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Vision Base URL
                                                </label>
                                                <input
                                                    type="text"
                                                    value={settings.scamDetectionConfig?.aiSettings?.visionModel?.baseUrl || ''}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    visionModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.visionModel,
                                                                        baseUrl: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder="https://api.openai.com/v1"
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                                    Vision API Key
                                                </label>
                                                <input
                                                    type="password"
                                                    value={settings.scamDetectionConfig?.aiSettings?.visionModel?.apiKey === '***HIDDEN***' ? '' : (settings.scamDetectionConfig?.aiSettings?.visionModel?.apiKey || '')}
                                                    onChange={(e) =>
                                                        setSettings({
                                                            ...settings,
                                                            scamDetectionConfig: {
                                                                ...settings.scamDetectionConfig,
                                                                aiSettings: {
                                                                    ...settings.scamDetectionConfig?.aiSettings,
                                                                    visionModel: {
                                                                        ...settings.scamDetectionConfig?.aiSettings?.visionModel,
                                                                        apiKey: e.target.value,
                                                                    },
                                                                },
                                                            },
                                                        })
                                                    }
                                                    placeholder={settings.scamDetectionConfig?.aiSettings?.visionModel?.apiKey === '***HIDDEN***' ? 'Vision API key is set (hidden)' : 'sk-...'}
                                                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                {settings.scamDetectionConfig?.aiSettings?.visionModel?.apiKey === '***HIDDEN***' && (
                                                    <p className="mt-1 text-xs text-slate-400">Vision API key is set and hidden. Enter a new key only to replace it.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CollapsibleSection>

                        <div className="flex justify-end">
                            <Button type="submit" disabled={saving}>
                                {saving ? (
                                    <span className="flex items-center gap-2">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Saving...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Icon name="save" className="w-4 h-4" />
                                        Save Anti-Scam Settings
                                    </span>
                                )}
                            </Button>
                        </div>
                    </form>
                )}

                {/* Banned Words Tab */}
                {activeTab === 'words' && (
                    <div className="space-y-4">
                        <CollapsibleSection title="Add Banned Word" icon="plus" isOpen={sectionsOpen['add-banned-word']} onToggle={() => toggleSection('add-banned-word')}>
                            <form onSubmit={handleAddWord} className="flex gap-2">
                                <input
                                    type="text"
                                    value={newWord}
                                    onChange={(e) => setNewWord(e.target.value)}
                                    placeholder="Enter word to ban..."
                                    className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <Button type="submit" disabled={!newWord.trim()}>
                                    Add Word
                                </Button>
                            </form>
                        </CollapsibleSection>

                        <CollapsibleSection
                            title={`Banned Words List (${bannedWords.length})`}
                            icon="document"
                            isOpen={sectionsOpen['banned-words-list']}
                            onToggle={() => toggleSection('banned-words-list')}
                        >
                            {bannedWords.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-slate-400">No banned words configured yet</p>
                                    <p className="text-sm text-slate-500 mt-2">
                                        Add words above to automatically moderate them in your server
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {bannedWords.map((word) => (
                                        <div
                                            key={word}
                                            className="flex items-center justify-between bg-slate-800 px-4 py-3 rounded-lg hover:bg-slate-750 transition-colors"
                                        >
                                            <span className="text-slate-300 font-medium">{word}</span>
                                            <button
                                                onClick={() => handleRemoveWord(word)}
                                                className="text-red-400 hover:text-red-300 text-sm font-medium ml-4"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CollapsibleSection>
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default SettingsPage
