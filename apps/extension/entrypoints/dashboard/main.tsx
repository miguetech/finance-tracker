import React from 'react'
import { createRoot } from 'react-dom/client'
import './dashboard.css'
import { DashboardApp } from './DashboardApp'

createRoot(document.getElementById('root')!).render(<DashboardApp />)
