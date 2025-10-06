# TEAIM Deployment Guide

## Prerequisites

1. **Supabase Project Setup**
   - Create a new project at [supabase.com](https://supabase.com)
   - Note your project URL and keys from Settings → API
   - Enable the `vector` extension in SQL Editor

2. **OpenAI API Key**
   - Get your API key from [platform.openai.com](https://platform.openai.com)
   - Ensure you have access to `gpt-5` and `text-embedding-3-large`

3. **Required Software**
   - Python 3.11+
   - Node.js 18+
   - Git

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
# Clone repository
git clone <repository-url>
cd teaim

# Install Python dependencies
cd server
pip install -r requirements.txt
cd ..

# Install Node.js dependencies
npm install
