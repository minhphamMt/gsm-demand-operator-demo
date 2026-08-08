"""Explanation Engine — giải thích plan bằng ngôn ngữ vận hành (§5.6, task T5).

Sẽ chứa (ARCHITECTURE.md §7):
    templates.py   §5.6 Lớp 1 · template cho người điều phối + template cho tài xế
    validator.py   §5.6 · khẳng định 100% con số trong text khớp explanation_data
    llm_layer2.py  §7.1 #2 · OPTIONAL, cờ mặc định TẮT, chỉ làm nếu W5 dư thời gian

LLM không bao giờ được sinh reason_text của offer: văn bản đó đi kèm cam kết tiền
thưởng với người ngoài hãng, một con số bịa ra là một lời hứa sai (CLAUDE.md §10.1 #5).
"""
