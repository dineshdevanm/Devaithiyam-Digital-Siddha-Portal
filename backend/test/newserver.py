import os
import pandas as pd
from dotenv import load_dotenv
from typing import List, Tuple, Dict, Optional, Any
from contextlib import asynccontextmanager


# --- FastAPI Imports ---
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain.chains import RetrievalQA
from langchain_community.document_loaders import DataFrameLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain.chains.retrieval import create_retrieval_chain
from langchain.text_splitter import CharacterTextSplitter



app = FastAPI(
    title="Simple Medical Chatbot API",
)

def classify_by_name_and_symptoms(disease_data):
    """
    Classify disease by name and symptoms when type is not available.
    """
    # Get the disease name and symptoms
    disease_name = str(disease_data.get('disease', '') or disease_data.get('name', '')).lower()
    symptoms = str(disease_data.get('sign_and_symptoms', '')).lower()
    remedy = str(disease_data.get('remedy', '')).lower()
    
    # Common keywords for each dosha type
    kabam_keywords = ['cough', 'cold', 'phlegm', 'mucus', 'respiratory', 'asthma', 'congestion', 'sinus', 'nausea']
    pitham_keywords = ['fever', 'heat', 'acid', 'inflammation', 'burning', 'gastritis', 'bile', 'rash', 'infection', 'vomiting']
    vatham_keywords = ['pain', 'arthritis', 'numbness', 'constipation', 'stiffness', 'dryness', 'cramp', 'gas', 'bloating', 'headache']
    
    # Check for keywords in name, symptoms, and remedy
    kabam_matches = sum(1 for word in kabam_keywords if word in disease_name or word in symptoms)
    pitham_matches = sum(1 for word in pitham_keywords if word in disease_name or word in symptoms)
    vatham_matches = sum(1 for word in vatham_keywords if word in disease_name or word in symptoms)
    
    # Assign type based on highest match count
    max_matches = max(kabam_matches, pitham_matches, vatham_matches)
    
    if max_matches == 0:
        disease_data['type'] = 'unknown'
    elif kabam_matches == max_matches:
        disease_data['type'] = 'kabam'
    elif pitham_matches == max_matches:
        disease_data['type'] = 'pitham'
    elif vatham_matches == max_matches:
        disease_data['type'] = 'vatham'
        
    return disease_data
class ChatResponse(BaseModel):
    answer: str
    sources: list = []
    referenced_remedies: Optional[List[Dict[str, Any]]] = None

class Disease(BaseModel):
    disease: Optional[str] = None
    name: Optional[str] = None  
    sign_and_symptoms: Optional[str] = None
    remedy: Optional[str] = None
    prepared_medicines: Optional[str] = None
    external_medicines: Optional[str] = None
    others: Optional[str] = None
    type: Optional[str] = None

class DiseaseResponse(BaseModel):
    count: int
    diseases: List[Dict]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str



csv_path = "../corpus/cleaned_chatbot.csv"
df = pd.read_csv(csv_path)

docs = []
for _, row in df.iterrows():
    text = f"Disease: {row['disease']}\nSigns & Symptoms: {row['sign_and_symptoms']}\nRemedy: {row['remedy']}\nPrepared Medicines: {row['prepared_medicines']}\nExternal Medicines: {row['external_medicines']}\nOthers: {row['others']}"
    docs.append(text)

# 2️⃣ Split into chunks
text_splitter = CharacterTextSplitter(chunk_size=500, chunk_overlap=50)
split_docs = []
for doc in docs:
    split_docs.extend(text_splitter.split_text(doc))

# 3️⃣ Create embeddings once
apikeyhg = os.getenv("HUGGINGFACEHUB_API_TOKEN")
model_name = "sentence-transformers/all-MiniLM-L6-v2"
# Do not pass unknown/unsupported kwargs (like `api_key` or `apikey`) to
# HuggingFaceEmbeddings; the implementation validates its fields via pydantic
# and will raise on unexpected keys. Instead rely on the environment variable
# or the library's own auth mechanism.
embeddings = HuggingFaceEmbeddings(model_name=model_name)
vectorstore = FAISS.from_texts(split_docs, embeddings)

# 4️⃣ Initialize retriever
retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 3})

# 5️⃣ Initialize LLM and RAG chain once
apikey = os.getenv("GOOGLE_API_KEY")
llm = ChatGoogleGenerativeAI(model="gemma-3n-e4b-it", api_key=apikey)
rag_chain = RetrievalQA.from_chain_type(llm=llm, chain_type="stuff", retriever=retriever)

@app.post("/chat")
async def chat(request: ChatRequest):
    query = request.query
    response = rag_chain.run(query)
    return {"answer": response}


@app.get("/", summary="Root endpoint")
def read_root():
    return {
        "message": "Siddha Medicine API",
        "endpoints": [
            "/diseases/kabam",
            "/diseases/pitham",
            "/diseases/vatham",
            "/diseases/all",
            "/diseases/search",
            "/herbs",
            "/herbs/search",
            "/remedies",
            "/remedies/search",
            "/chat"
        ]
    }

@app.get("/diseases/kabam", response_model=DiseaseResponse, summary="Get all Kabam diseases")
def get_kabam_diseases():
    """
    Returns all diseases classified under Kabam dosha.
    """
    diseases = app.state.kabam_diseases
    return {
        "count": len(diseases),
        "diseases": diseases
    }

@app.get("/diseases/pitham", response_model=DiseaseResponse, summary="Get all Pitham diseases")
def get_pitham_diseases():
    """
    Returns all diseases classified under Pitham dosha.
    """
    diseases = app.state.pitham_diseases
    return {
        "count": len(diseases),
        "diseases": diseases
    }

@app.get("/diseases/vatham", response_model=DiseaseResponse, summary="Get all Vatham diseases")
def get_vatham_diseases():
    """
    Returns all diseases classified under Vatham dosha.
    """
    diseases = app.state.vatham_diseases
    return {
        "count": len(diseases),
        "diseases": diseases
    }

@app.get("/diseases/all", response_model=DiseaseResponse, summary="Get all diseases")
def get_all_diseases():
    """
    Returns all diseases in the database.
    """
    diseases = app.state.all_diseases
    return {
        "count": len(diseases),
        "diseases": diseases
    }

@app.get("/diseases/search", response_model=DiseaseResponse, summary="Search for diseases")
def search_diseases(query: str):
    """
    Search for diseases by name or symptoms.
    """
    if not query or len(query) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters long")
    
    query = query.lower()
    results = []
    
    for disease in app.state.all_diseases:
        # Check for disease name in different possible column names
        name = str(disease.get('disease', '') or disease.get('name', '')).lower()
        symptoms = str(disease.get('sign_and_symptoms', '')).lower()
        remedy = str(disease.get('remedy', '')).lower()
        
        if query in name or query in symptoms or query in remedy:
            results.append(disease)
    
    return {
        "count": len(results),
        "diseases": results
    }

@app.get("/remedies", summary="Get all remedies")
def get_remedies():
    """
    Returns all remedies from the remedy.csv file.
    """
    try:
        import os
        import csv
        
        # Possible paths for remedy.csv
        csv_paths = [
            'remedy.csv',  # Current directory
            '../backend/remedy.csv',  # Backend directory
            './remedy.csv'  # Explicit current directory
        ]
        
        remedies = []
        loaded_path = None
        
        for path in csv_paths:
            try:
                if os.path.exists(path):
                    with open(path, 'r', encoding='utf-8') as file:
                        reader = csv.DictReader(file)
                        remedies = list(reader)
                        loaded_path = path
                        break
            except Exception as e:
                continue
        
        if not remedies:
            raise FileNotFoundError("Could not find the remedy.csv file in any expected location")
        
        print(f"✅ Loaded remedies data from {loaded_path} with {len(remedies)} records")
        
        return {
            "count": len(remedies),
            "remedies": remedies
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load remedies: {str(e)}")

@app.get("/remedies/search", summary="Search for remedies")
def search_remedies(query: str):
    """
    Search for remedies by name, preparation, or usage.
    """
    if not query or len(query) < 2:
        raise HTTPException(status_code=400, detail="Search query must be at least 2 characters long")
    
    try:
        # Get all remedies
        all_remedies_result = get_remedies()
        all_remedies = all_remedies_result["remedies"]
        
        query = query.lower()
        results = []
        
        for remedy in all_remedies:
            name = str(remedy.get("Remedy Name", "")).lower()
            preparation = str(remedy.get("Preparation", "")).lower()
            usage = str(remedy.get("Usage", "")).lower()
            
            if query in name or query in preparation or query in usage:
                results.append(remedy)
        
        return {
            "count": len(results),
            "remedies": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search remedies: {str(e)}")


