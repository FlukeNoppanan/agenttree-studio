# Studio UI language style guide

Thai explains the system; established English vocabulary names the concepts. Both locales use the existing i18next resources. Write each locale naturally rather than copying English sentence structure.

## Product and technical terms

Keep: AgentTree, AgentTree Studio, Dashboard, Getting Started, Tree/Trees, Agent/Agents, Root, Manager, Specialist, Template/Templates, Blank Tree, Provider/AI Provider, Model/Models, Tool/Tools, MCP, Run/Runs, Execution Trace, API, API Key/API Keys, Webhook, Connect, Live View, JSON, HTTP/HTTPS, SSE, Artifact/Artifacts, Docker, PostgreSQL and provider brands.

Use singular when referring to one item; use the actual page title for navigation (e.g. Templates, Providers, API Keys). Keep protocol fields, model IDs, event types and user-provided content unchanged. Technical content in payloads is not UI prose.

Avoid technical-concept translations/transliterations: ต้นไม้, ทรี, ตัวแทน, เอเจนต์, แม่แบบ, เทมเพลต, ผู้ให้บริการ, พรอไวเดอร์, โมเดล, ทูล, เว็บฮุก, แดชบอร์ด, รัน, ร่องรอยการดำเนินการ. Do not mistake ordinary Thai uses of these words outside technical concepts for errors.

## Thai actions and explanations

Use normal Thai UI language: สร้าง, บันทึก, ยกเลิก, ลบ, แก้ไข, ค้นหา, ปิด, ดำเนินการต่อ, กลับ, ถัดไป, ชื่อ, คำอธิบาย, สถานะ, การตั้งค่า, สร้างเมื่อ, อัปเดตเมื่อ, จำเป็น, ไม่บังคับ, พร้อมใช้งาน.

Examples:

- สร้าง Tree ใหม่
- เลือก Template ที่ต้องการใช้
- เพิ่ม Agent ใน Tree
- เชื่อมต่อ AI Provider
- เลือก Model สำหรับ Agent
- เริ่ม Run เพื่อทดสอบ Tree
- ดูผลลัพธ์และ Execution Trace
- เชื่อมต่อ Tree ผ่าน API หรือ Webhook

Explain technical nouns in natural sentences: “Capability ใช้ระบุว่า Agent แต่ละตัวเหมาะกับงานประเภทใด เพื่อให้ AgentTree ส่งงานไปยัง Agent ที่เหมาะสม”. “Execution Trace แสดงลำดับการทำงานของ Agent ตั้งแต่รับงาน ส่งต่องาน ไปจนถึงผลลัพธ์สุดท้าย”.

Keep incoming Webhook Trigger and outgoing Webhook Result Destination distinct. Never describe a user API Key as a provider credential or webhook secret. Avoid implying that opening Connect publishes an integration.

## Implementation

Use translation keys for normal labels, prompts, errors and help. Keep meaningful key names. Preserve interpolation placeholders between locales. Subscribe components to `useTranslation` so switching language updates immediately. Do not translate stored resource names, raw event payloads or runtime enums. Existing Learning roadmap text is outside this refresh.
