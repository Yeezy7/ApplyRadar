import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  FileText,
  Trash2,
  Edit2,
  Star,
  Upload,
  Sparkles,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Briefcase,
  Wrench,
  Award,
  Loader2,
} from "lucide-react";
import type {
  Resume,
  EducationEntry,
  WorkExperienceEntry,
  ProjectEntry,
  CertificationEntry,
} from "@applyradar/shared";
import { resumeService } from "../services";

type Section = "basic" | "education" | "work" | "projects" | "skills" | "certs" | "summary";

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingResume, setEditingResume] = useState<Resume | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadResumes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await resumeService.listResumes();
      setResumes(data);
    } catch (e) {
      showMessage("error", `加载失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除这份简历吗？")) return;
    try {
      await resumeService.deleteResume(id);
      showMessage("success", "已删除");
      loadResumes();
    } catch (e) {
      showMessage("error", `删除失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await resumeService.setDefaultResume(id);
      showMessage("success", "已设为默认");
      loadResumes();
    } catch (e) {
      showMessage("error", `操作失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 pb-8 pt-4">
      {/* Message toast */}
      {message && (
        <div
          className={`fixed top-16 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-stone-900">简历管理</h1>
          <p className="text-sm text-stone-500 mt-1">
            管理你的简历，浏览器扩展可自动填写表单
          </p>
        </div>
        <button
          onClick={() => {
            setEditingResume(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-stone-900 text-white rounded-2xl text-sm font-medium hover:bg-stone-800 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建简历
        </button>
      </div>

      {showForm ? (
        <ResumeForm
          resume={editingResume}
          onSaved={() => {
            setShowForm(false);
            setEditingResume(null);
            loadResumes();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditingResume(null);
          }}
          showMessage={showMessage}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-stone-400 animate-spin" />
        </div>
      ) : resumes.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-stone-200/60">
          <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-500 mb-4">还没有简历</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-stone-900 text-white rounded-xl text-sm hover:bg-stone-800 transition"
          >
            创建第一份简历
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="bg-white rounded-2xl border border-stone-200/60 p-5 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-base font-semibold text-stone-900 truncate">
                      {resume.name}
                    </h3>
                    {resume.is_default === 1 && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full ring-1 ring-amber-200">
                        默认
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-500">
                    {resume.full_name && <span>{resume.full_name}</span>}
                    {resume.phone && <span>{resume.phone}</span>}
                    {resume.email && <span>{resume.email}</span>}
                    {resume.target_position && (
                      <span className="text-blue-600">{resume.target_position}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-stone-400">
                    {resume.education && resume.education.length > 0 && (
                      <span>{resume.education.length} 段教育经历</span>
                    )}
                    {resume.work_experience && resume.work_experience.length > 0 && (
                      <span>{resume.work_experience.length} 段工作经历</span>
                    )}
                    {resume.projects && resume.projects.length > 0 && (
                      <span>{resume.projects.length} 个项目</span>
                    )}
                    {resume.skills && resume.skills.length > 0 && (
                      <span>{resume.skills.length} 项技能</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {resume.is_default !== 1 && (
                    <button
                      onClick={() => handleSetDefault(resume.id)}
                      className="p-2 text-stone-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition"
                      title="设为默认"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingResume(resume);
                      setShowForm(true);
                    }}
                    className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(resume.id)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Resume Form ============

interface ResumeFormProps {
  resume: Resume | null;
  onSaved: () => void;
  onCancel: () => void;
  showMessage: (type: "success" | "error", text: string) => void;
}

function ResumeForm({ resume, onSaved, onCancel, showMessage }: ResumeFormProps) {
  const [form, setForm] = useState<Partial<Resume>>(resume || { name: "" });
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<Section, boolean>>({
    basic: true,
    education: false,
    work: false,
    projects: false,
    skills: false,
    certs: false,
    summary: false,
  });

  const toggleSection = (s: Section) =>
    setExpandedSections((prev) => ({ ...prev, [s]: !prev[s] }));

  const handleSave = async () => {
    if (!form.name?.trim()) {
      showMessage("error", "简历名称不能为空");
      return;
    }
    setSaving(true);
    try {
      if (resume) {
        await resumeService.updateResume(resume.id, form);
        showMessage("success", "已保存");
      } else {
        await resumeService.createResume(form as any);
        showMessage("success", "已创建");
      }
      onSaved();
    } catch (e) {
      showMessage("error", `保存失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async () => {
    let resumeId = resume?.id;
    if (!resumeId) {
      if (!form.name?.trim()) {
        showMessage("error", "请先填写简历名称");
        return;
      }
      setSaving(true);
      try {
        const created = await resumeService.createResume(form as any);
        resumeId = created.id;
        setForm(created);
      } catch (err) {
        showMessage("error", `创建失败: ${err instanceof Error ? err.message : String(err)}`);
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    setUploading(true);
    try {
      await resumeService.uploadResumePdf(resumeId!);
      showMessage("success", "PDF 已上传");
      const updated = await resumeService.getResume(resumeId!);
      setForm(updated);
    } catch (err) {
      showMessage("error", `上传失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  const handleParse = async () => {
    const id = resume?.id || (form as Resume).id;
    if (!id) {
      showMessage("error", "请先保存简历");
      return;
    }
    setParsing(true);
    try {
      const updated = await resumeService.parseResumePdf(id);
      setForm(updated);
      showMessage("success", "简历已解析");
    } catch (e) {
      showMessage("error", `解析失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const updateField = <K extends keyof Resume>(key: K, value: Resume[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-stone-200/60 p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleFileUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-2xl cursor-pointer transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "上传中..." : "选择 PDF"}
          </button>
          {form.pdf_file_path && (
            <button
              onClick={handleParse}
              disabled={parsing}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-stone-900 hover:bg-stone-800 rounded-2xl disabled:opacity-50 transition-colors"
            >
              {parsing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {parsing ? "解析中..." : "AI 解析"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-2xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm text-white bg-stone-900 hover:bg-stone-800 rounded-2xl disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* Basic info */}
      <FormSection
        title="基本信息"
        icon={<FileText className="w-4 h-4" />}
        expanded={expandedSections.basic}
        onToggle={() => toggleSection("basic")}
      >
        <div className="grid grid-cols-2 gap-4">
          <InputField label="简历名称" value={form.name || ""} onChange={(v) => updateField("name", v)} required />
          <InputField label="姓名" value={form.full_name || ""} onChange={(v) => updateField("full_name", v)} />
          <InputField label="手机" value={form.phone || ""} onChange={(v) => updateField("phone", v)} />
          <InputField label="邮箱" value={form.email || ""} onChange={(v) => updateField("email", v)} type="email" />
          <InputField label="性别" value={form.gender || ""} onChange={(v) => updateField("gender", v)} />
          <InputField label="出生日期" value={form.birth_date || ""} onChange={(v) => updateField("birth_date", v)} placeholder="YYYY-MM-DD" />
          <InputField label="籍贯" value={form.hometown || ""} onChange={(v) => updateField("hometown", v)} />
          <InputField label="政治面貌" value={form.political_status || ""} onChange={(v) => updateField("political_status", v)} />
          <InputField label="求职意向" value={form.target_position || ""} onChange={(v) => updateField("target_position", v)} />
          <InputField label="期望城市" value={form.target_city || ""} onChange={(v) => updateField("target_city", v)} />
          <InputField label="期望薪资" value={form.expected_salary || ""} onChange={(v) => updateField("expected_salary", v)} />
          <div>
            <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">
              工作类型
            </label>
            <select
              value={form.job_type || ""}
              onChange={(e) => updateField("job_type", e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
            >
              <option value="">请选择</option>
              <option value="full_time">全职</option>
              <option value="intern">实习</option>
              <option value="contract">合同</option>
            </select>
          </div>
        </div>
      </FormSection>

      {/* Education */}
      <FormSection
        title="教育经历"
        icon={<GraduationCap className="w-4 h-4" />}
        expanded={expandedSections.education}
        onToggle={() => toggleSection("education")}
        count={form.education?.length}
        onAdd={() =>
          updateField("education", [
            ...(form.education || []),
            { school: "", degree: "", major: "", start_date: "", end_date: "", gpa: "" },
          ])
        }
      >
        {form.education?.map((edu, i) => (
          <EducationItem
            key={i}
            data={edu}
            onChange={(updated) => {
              const list = [...(form.education || [])];
              list[i] = updated;
              updateField("education", list);
            }}
            onRemove={() => {
              const list = [...(form.education || [])];
              list.splice(i, 1);
              updateField("education", list);
            }}
          />
        ))}
        {(!form.education || form.education.length === 0) && (
          <p className="text-sm text-stone-400 text-center py-4">暂无教育经历</p>
        )}
      </FormSection>

      {/* Work experience */}
      <FormSection
        title="工作经历"
        icon={<Briefcase className="w-4 h-4" />}
        expanded={expandedSections.work}
        onToggle={() => toggleSection("work")}
        count={form.work_experience?.length}
        onAdd={() =>
          updateField("work_experience", [
            ...(form.work_experience || []),
            { company: "", title: "", start_date: "", end_date: "", description: "" },
          ])
        }
      >
        {form.work_experience?.map((work, i) => (
          <WorkItem
            key={i}
            data={work}
            onChange={(updated) => {
              const list = [...(form.work_experience || [])];
              list[i] = updated;
              updateField("work_experience", list);
            }}
            onRemove={() => {
              const list = [...(form.work_experience || [])];
              list.splice(i, 1);
              updateField("work_experience", list);
            }}
          />
        ))}
        {(!form.work_experience || form.work_experience.length === 0) && (
          <p className="text-sm text-stone-400 text-center py-4">暂无工作经历</p>
        )}
      </FormSection>

      {/* Projects */}
      <FormSection
        title="项目经历"
        icon={<Wrench className="w-4 h-4" />}
        expanded={expandedSections.projects}
        onToggle={() => toggleSection("projects")}
        count={form.projects?.length}
        onAdd={() =>
          updateField("projects", [
            ...(form.projects || []),
            { name: "", role: "", start_date: "", end_date: "", description: "", tech_stack: [] },
          ])
        }
      >
        {form.projects?.map((proj, i) => (
          <ProjectItem
            key={i}
            data={proj}
            onChange={(updated) => {
              const list = [...(form.projects || [])];
              list[i] = updated;
              updateField("projects", list);
            }}
            onRemove={() => {
              const list = [...(form.projects || [])];
              list.splice(i, 1);
              updateField("projects", list);
            }}
          />
        ))}
        {(!form.projects || form.projects.length === 0) && (
          <p className="text-sm text-stone-400 text-center py-4">暂无项目经历</p>
        )}
      </FormSection>

      {/* Skills */}
      <FormSection
        title="技能"
        icon={<Wrench className="w-4 h-4" />}
        expanded={expandedSections.skills}
        onToggle={() => toggleSection("skills")}
        count={form.skills?.length}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {form.skills?.map((skill, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-3 py-1 bg-stone-100 text-stone-700 text-sm rounded-full"
            >
              {skill}
              <button
                onClick={() => {
                  const list = [...(form.skills || [])];
                  list.splice(i, 1);
                  updateField("skills", list);
                }}
                className="ml-1 text-stone-400 hover:text-stone-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <SkillInput
          onAdd={(skill) => updateField("skills", [...(form.skills || []), skill])}
        />
      </FormSection>

      {/* Certifications */}
      <FormSection
        title="证书"
        icon={<Award className="w-4 h-4" />}
        expanded={expandedSections.certs}
        onToggle={() => toggleSection("certs")}
        count={form.certifications?.length}
        onAdd={() =>
          updateField("certifications", [
            ...(form.certifications || []),
            { name: "", date: "", issuer: "" },
          ])
        }
      >
        {form.certifications?.map((cert, i) => (
          <CertItem
            key={i}
            data={cert}
            onChange={(updated) => {
              const list = [...(form.certifications || [])];
              list[i] = updated;
              updateField("certifications", list);
            }}
            onRemove={() => {
              const list = [...(form.certifications || [])];
              list.splice(i, 1);
              updateField("certifications", list);
            }}
          />
        ))}
        {(!form.certifications || form.certifications.length === 0) && (
          <p className="text-sm text-stone-400 text-center py-4">暂无证书</p>
        )}
      </FormSection>

      {/* Summary */}
      <FormSection
        title="自我评价"
        icon={<FileText className="w-4 h-4" />}
        expanded={expandedSections.summary}
        onToggle={() => toggleSection("summary")}
      >
        <textarea
          value={form.summary || ""}
          onChange={(e) => updateField("summary", e.target.value)}
          rows={5}
          className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all resize-none"
          placeholder="简要介绍自己的优势和特长..."
        />
      </FormSection>

      {/* Bottom save */}
      <div className="flex justify-end gap-3 pb-4">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 text-sm text-stone-600 hover:bg-stone-100 rounded-2xl transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm text-white bg-stone-900 hover:bg-stone-800 rounded-2xl disabled:opacity-50 transition-all shadow-sm"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

// ============ Reusable sub-components ============

function FormSection({
  title,
  icon,
  expanded,
  onToggle,
  count,
  onAdd,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  count?: number;
  onAdd?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200/60 overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-5 py-4 text-left hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-stone-500">{icon}</span>
          <span className="text-sm font-semibold text-stone-900">{title}</span>
          {count !== undefined && count > 0 && (
            <span className="px-2 py-0.5 text-xs bg-stone-100 text-stone-600 rounded-full">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onAdd && expanded && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="px-2 py-1 text-xs text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer transition"
            >
              + 添加
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          )}
        </div>
      </button>
      {expanded && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
      />
    </div>
  );
}

function EducationItem({
  data,
  onChange,
  onRemove,
}: {
  data: EducationEntry;
  onChange: (d: EducationEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 bg-stone-50 rounded-xl space-y-3 relative">
      <button onClick={onRemove} className="absolute top-2 right-2 p-1 text-stone-400 hover:text-red-500 rounded transition">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="学校" value={data.school} onChange={(v) => onChange({ ...data, school: v })} />
        <InputField label="学历" value={data.degree || ""} onChange={(v) => onChange({ ...data, degree: v })} placeholder="本科/硕士/博士" />
        <InputField label="专业" value={data.major || ""} onChange={(v) => onChange({ ...data, major: v })} />
        <InputField label="GPA/排名" value={data.gpa || ""} onChange={(v) => onChange({ ...data, gpa: v })} />
        <InputField label="开始时间" value={data.start_date || ""} onChange={(v) => onChange({ ...data, start_date: v })} placeholder="YYYY-MM" />
        <InputField label="结束时间" value={data.end_date || ""} onChange={(v) => onChange({ ...data, end_date: v })} placeholder="YYYY-MM" />
      </div>
    </div>
  );
}

function WorkItem({
  data,
  onChange,
  onRemove,
}: {
  data: WorkExperienceEntry;
  onChange: (d: WorkExperienceEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 bg-stone-50 rounded-xl space-y-3 relative">
      <button onClick={onRemove} className="absolute top-2 right-2 p-1 text-stone-400 hover:text-red-500 rounded transition">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="公司" value={data.company} onChange={(v) => onChange({ ...data, company: v })} />
        <InputField label="职位" value={data.title || ""} onChange={(v) => onChange({ ...data, title: v })} />
        <InputField label="开始时间" value={data.start_date || ""} onChange={(v) => onChange({ ...data, start_date: v })} placeholder="YYYY-MM" />
        <InputField label="结束时间" value={data.end_date || ""} onChange={(v) => onChange({ ...data, end_date: v })} placeholder="YYYY-MM" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">工作描述</label>
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all resize-none"
        />
      </div>
    </div>
  );
}

function ProjectItem({
  data,
  onChange,
  onRemove,
}: {
  data: ProjectEntry;
  onChange: (d: ProjectEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 bg-stone-50 rounded-xl space-y-3 relative">
      <button onClick={onRemove} className="absolute top-2 right-2 p-1 text-stone-400 hover:text-red-500 rounded transition">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <div className="grid grid-cols-2 gap-3">
        <InputField label="项目名称" value={data.name} onChange={(v) => onChange({ ...data, name: v })} />
        <InputField label="角色" value={data.role || ""} onChange={(v) => onChange({ ...data, role: v })} />
        <InputField label="开始时间" value={data.start_date || ""} onChange={(v) => onChange({ ...data, start_date: v })} placeholder="YYYY-MM" />
        <InputField label="结束时间" value={data.end_date || ""} onChange={(v) => onChange({ ...data, end_date: v })} placeholder="YYYY-MM" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">项目描述</label>
        <textarea
          value={data.description || ""}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          rows={3}
          className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-stone-500 mb-1.5 uppercase tracking-wider">技术栈</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {data.tech_stack?.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-stone-200 text-stone-600 text-xs rounded-full">
              {t}
              <button
                onClick={() => {
                  const stack = [...(data.tech_stack || [])];
                  stack.splice(i, 1);
                  onChange({ ...data, tech_stack: stack });
                }}
                className="text-stone-400 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <SkillInput
          onAdd={(skill) => onChange({ ...data, tech_stack: [...(data.tech_stack || []), skill] })}
          placeholder="输入技术栈名称，回车添加"
        />
      </div>
    </div>
  );
}

function CertItem({
  data,
  onChange,
  onRemove,
}: {
  data: CertificationEntry;
  onChange: (d: CertificationEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4 bg-stone-50 rounded-xl grid grid-cols-3 gap-3 relative">
      <button onClick={onRemove} className="absolute top-2 right-2 p-1 text-stone-400 hover:text-red-500 rounded transition">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <InputField label="证书名称" value={data.name} onChange={(v) => onChange({ ...data, name: v })} />
      <InputField label="获取时间" value={data.date || ""} onChange={(v) => onChange({ ...data, date: v })} />
      <InputField label="颁发机构" value={data.issuer || ""} onChange={(v) => onChange({ ...data, issuer: v })} />
    </div>
  );
}

function SkillInput({
  onAdd,
  placeholder = "输入技能名称，回车添加",
}: {
  onAdd: (skill: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      onAdd(value.trim());
      setValue("");
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all"
    />
  );
}
