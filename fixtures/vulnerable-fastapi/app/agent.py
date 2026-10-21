import pandas as pd
from fastapi import FastAPI
from langchain_experimental.agents import create_pandas_dataframe_agent
from langchain_experimental.tools import PythonREPLTool
from langchain_openai import ChatOpenAI

app = FastAPI()
llm = ChatOpenAI(model="gpt-4o-mini")
tools = [PythonREPLTool()]


@app.post("/analyze")
def analyze(prompt: str):
    df = pd.read_csv("sales.csv")
    agent = create_pandas_dataframe_agent(llm, df, allow_dangerous_code=True)
    return agent.invoke(prompt)
