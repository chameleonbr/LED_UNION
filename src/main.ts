import { mount } from 'svelte'
import '@fontsource/barlow-semi-condensed/latin-400.css'
import '@fontsource/barlow-semi-condensed/latin-500.css'
import '@fontsource/barlow-semi-condensed/latin-600.css'
import './app.css'
import App from './App.svelte'

export default mount(App, { target: document.getElementById('app')! })
