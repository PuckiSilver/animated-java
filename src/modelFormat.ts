import * as pathjs from 'path'
import * as fs from 'fs'
import { BlockbenchMod } from './util/mods'
import { getDefaultProjectSettings } from './projectSettings'
import { _AnimatedJavaExporter } from './exporter'
import { getDefaultVariants, Variant } from './variants'
import { events } from './util/events'
import { consoleGroup } from './util/groupWrapper'

const FORMAT_VERSION = '1.0'

function processVersionMigration(model: any) {
	if (!model.meta.format_version) {
		model.meta.format_version = FORMAT_VERSION
	}

	if (model.meta.model_format === 'animatedJava/ajmodel') {
		model.meta.model_format = 'animated_java/ajmodel'
		model.meta.format_version = FORMAT_VERSION
	}
}

function addProjectToRecentProjects(file: FileResult) {
	var name = pathToName(file.path, true)
	if (file.path && isApp && !file.no_file) {
		let project = Project
		Project!.save_path = file.path
		Project!.name = pathToName(name, false)
		addRecentProject({
			name,
			path: file.path,
			icon: ajModelFormat.icon,
		})
		setTimeout(() => {
			if (Project == project) updateRecentProjectThumbnail()
		}, 200)
	}
}

interface IAnimatedJavaModel {
	animated_java?: {
		settings?: Record<string, any>
		exporter_settings?: Record<string, Record<string, any>>
		variants?: {
			name: string
			textures: Record<string, string>
			default: boolean
		}[]
	}
}

const loadAnimatedJavaProjectSettings = consoleGroup(
	'loadAnimatedJavaProjectSettings',
	(model: IAnimatedJavaModel) => {
		if (!Project) return

		Project.animated_java_settings = getDefaultProjectSettings()
		if (!(model.animated_java && model.animated_java.settings)) return

		console.log('Loading Animated Java project settings...')

		for (const [name, setting] of Object.entries(Project.animated_java_settings)) {
			if (model.animated_java.settings[name])
				setting.value = model.animated_java.settings[name]
		}

		Project.animated_java_exporter_settings = {}
		_AnimatedJavaExporter.exporters.forEach(exporter => {
			Project.animated_java_exporter_settings![exporter.id] = exporter.getSettings()
		})
		if (!model.animated_java.exporter_settings) return

		console.log('Loading Animated Java exporter settings...')

		for (const [exporterId, exporterSettings] of Object.entries(
			model.animated_java.exporter_settings
		)) {
			if (!Project.animated_java_exporter_settings![exporterId]) continue
			for (const [settingId, settingValue] of Object.entries(exporterSettings)) {
				if (!model.animated_java.exporter_settings[exporterId][settingId]) continue
				console.log('Loading value for', exporterId, settingId, settingValue)
				Project.animated_java_exporter_settings![exporterId][settingId].value = settingValue
			}
		}
	}
)

const exportAnimatedJavaProjectSettings = consoleGroup('exportAnimatedJavaProjectSettings', () => {
	if (!Project?.animated_java_settings) return
	const exported: any = {}
	for (const [name, setting] of Object.entries(Project.animated_java_settings)) {
		exported[name] = setting.value
	}

	return exported
})

function exportAnimatedJavaExporterSettings() {
	if (!Project?.animated_java_exporter_settings) return
	const exported: any = {}
	for (const [exporterId, exporterSettings] of Object.entries(
		Project.animated_java_exporter_settings
	)) {
		exported[exporterId] = {}
		for (const [settingId, setting] of Object.entries(exporterSettings)) {
			exported[exporterId][settingId] = setting.value
		}
	}

	return exported
}

const loadAnimatedJavaVariants = consoleGroup(
	'loadAnimatedJavaVariants',
	(model: IAnimatedJavaModel) => {
		if (!Project) return

		Project.animated_java_variants = getDefaultVariants()
		if (!(model.animated_java && model.animated_java.variants)) return
		Project.animated_java_variants.variants = []

		console.log('Loading Animated Java variants...')
		for (const variant of model.animated_java.variants) {
			Project.animated_java_variants.addVariant(Variant.fromJSON(variant), variant.default)
		}

		if (Project.animated_java_variants.variants.length === 0) {
			Project.animated_java_variants.addVariant(new Variant('default'), true)
		}
	}
)

const exportAnimatedJavaVariants = consoleGroup('exportAnimatedJavaVariants', () => {
	if (!Project?.animated_java_variants) return
	const exported: any = []
	for (const variant of Project.animated_java_variants.variants) {
		exported.push(variant.toJSON())
	}

	return exported
})

Blockbench.on('update_selection', () => {
	// console.log('Selection Update', Group.selected, Cube.selected)
	if (Format.id === ajModelFormat.id && Mode.selected.id === 'edit') {
		if (!Group.selected && Cube.selected.length > 0) {
			Format.rotation_limit = true
			Format.rotation_snap = true
			// console.log('Rotation Limit Enabled')
		} else {
			Format.rotation_limit = false
			Format.rotation_snap = false
			// console.log('Rotation Limit Disabled')
		}
	}
})

export const ajCodec = new Blockbench.Codec('ajmodel', {
	name: 'Animated Java Model',
	remember: true,
	extension: 'ajmodel',
	load_filter: {
		extensions: ['ajmodel', 'mcmodel'],
		type: 'json',
	},

	load: consoleGroup('ajCodec:load', (model, file, add) => {
		setupProject(ajModelFormat)
		Project!.save_path = file.path
		Project!.export_path = file.path
		addProjectToRecentProjects(file)
		ajCodec.parse!(model, file.path)
		events.loadProject.dispatch()
	}),

	parse: consoleGroup('ajCodec:parse', (model, path, add) => {
		if (!Project) throw new Error('No project to load model into...')
		console.log('Parsing Animated Java model...')
		if (!model.elements && !model.parent && !model.display && !model.textures) {
			Blockbench.showMessageBox({
				translateKey: 'invalid_model',
				icon: 'error',
			})
			return
		}
		ajCodec.dispatchEvent('parse', { model, path })
		processVersionMigration(model)
		loadAnimatedJavaProjectSettings(model)

		if (model.meta.box_uv !== undefined && Format.optional_box_uv) {
			Project.box_uv = model.meta.box_uv
		}

		for (var key in ModelProject.properties) {
			ModelProject.properties[key].merge(Project, model)
		}

		if (model.overrides) {
			Project.overrides = model.overrides
		}
		if (model.resolution !== undefined) {
			Project.texture_width = model.resolution.width
			Project.texture_height = model.resolution.height
		}

		if (model.textures) {
			model.textures.forEach((tex: Texture) => {
				var tex_copy = new Texture(tex, tex.uuid).add(false)
				if (isApp && tex.relative_path && Project.save_path) {
					let resolved_path = pathjs.resolve(Project.save_path, tex.relative_path)
					if (fs.existsSync(resolved_path)) {
						tex_copy.fromPath(resolved_path)
						return
					}
				}
				if (isApp && tex.path && fs.existsSync(tex.path) && !model.meta.backup) {
					tex_copy.fromPath(tex.path)
					return
				}
				if (tex.source && tex.source.substr(0, 5) == 'data:') {
					tex_copy.fromDataURL(tex.source)
				}
			})
		}
		loadAnimatedJavaVariants(model)

		if (model.elements) {
			let default_texture = Texture.getDefault()
			model.elements.forEach(function (element: any) {
				var copy = OutlinerElement.fromSave(element, true) as Cube
				for (var face in copy.faces) {
					if (!Format.single_texture && element.faces) {
						var texture =
							element.faces[face].texture !== null &&
							Texture.all[element.faces[face].texture]
						if (texture) {
							copy.faces[face].texture = texture.uuid
						}
					} else if (default_texture && copy.faces && copy.faces[face].texture !== null) {
						copy.faces[face].texture = default_texture.uuid
					}
				}
				copy.init()
			})
		}
		if (model.outliner) {
			parseGroups(model.outliner)
		}
		if (model.animations) {
			model.animations.forEach((anim: _Animation) => {
				const base_ani = new Blockbench.Animation()
				base_ani.uuid = anim.uuid
				base_ani.extend(anim).add()
				if (isApp && Format.animation_files) {
					base_ani.saved_name = base_ani.name
				}
			})
		}
		if (model.animation_controllers) {
			model.animation_controllers.forEach((anim: _Animation) => {
				var base_ani = new AnimationController()
				base_ani.uuid = anim.uuid
				base_ani.extend(anim).add()
				if (isApp && Format.animation_files) {
					base_ani.saved_name = base_ani.name
				}
			})
		}
		if (model.animation_variable_placeholders) {
			Interface.Panels.variable_placeholders.inside_vue._data.text =
				model.animation_variable_placeholders
		}
		if (model.backgrounds) {
			for (var key in model.backgrounds) {
				if (Project.backgrounds.hasOwnProperty(key)) {
					let store = model.backgrounds[key]
					let real = Project.backgrounds[key]

					if (store.image !== undefined) {
						real.image = store.image
					}
					if (store.size !== undefined) {
						real.size = store.size
					}
					if (store.x !== undefined) {
						real.x = store.x
					}
					if (store.y !== undefined) {
						real.y = store.y
					}
					if (store.lock !== undefined) {
						real.lock = store.lock
					}
				}
			}
			Preview.all.forEach(p => {
				if (p.canvas.isConnected) {
					p.loadBackground()
				}
			})
		}
		if (model.history) {
			Undo.history = model.history.slice()
			Undo.index = model.history_index
		}
		Canvas.updateAllBones()
		Canvas.updateAllPositions()
		Validator.validate()
		ajCodec.dispatchEvent('parsed', { model })

		if (model.editor_state) {
			let state = model.editor_state
			Merge.string(Project, state, 'save_path')
			Merge.string(Project, state, 'export_path')
			Merge.boolean(Project, state, 'saved')
			Merge.number(Project, state, 'added_models')
			Merge.string(Project, state, 'mode')
			Merge.string(Project, state, 'tool')
			Merge.string(Project, state, 'display_uv')
			Merge.boolean(Project, state, 'exploded_view')
			if (state.uv_viewport) {
				Merge.number(Project.uv_viewport, state.uv_viewport, 'zoom')
				Merge.arrayVector2((Project.uv_viewport = state.uv_viewport), 'offset')
			}
			if (state.previews) {
				for (let id in state.previews) {
					Project.previews[id] = state.previews[id]
				}
			}
			state.selected_elements.forEach((uuid: string) => {
				let el = Outliner.elements.find(el2 => el2.uuid == uuid)
				if (el) Project.selected_elements.push(el)
			})
			Group.selected =
				state.selected_group && Group.all.find(g => g.uuid == state.selected_group)
			for (let key in state.selected_vertices) {
				Project.mesh_selection[key] = state.mesh_selection[key]
			}
			Project.selected_faces.replace(state.selected_faces)
			;(
				state.selected_texture && Texture.all.find(t => t.uuid == state.selected_texture)
			)?.select()

			Project.loadEditorState()
		}

		// if (Project.animated_java_variants!.defaultVariant) {
		// 	applyVariantToModel(Project.animated_java_variants!.defaultVariant)
		// }

		ajCodec.dispatchEvent('parsed', { model })
	}),

	compile: consoleGroup('ajCodec:compile', options => {
		if (!options) options = {}
		if (!Project) throw new Error('No project to compile...')
		console.log('Compiling Animated Java model...')

		const selectedVariant = Project.animated_java_variants!.selectedVariant

		const model: any = {
			meta: {
				format: ajCodec.format.id,
				format_version: FORMAT_VERSION,
			},
			animated_java: {
				settings: exportAnimatedJavaProjectSettings(),
				exporter_settings: exportAnimatedJavaExporterSettings(),
				variants: exportAnimatedJavaVariants(),
			},
		}

		for (const key in ModelProject.properties) {
			if (ModelProject.properties[key].export)
				ModelProject.properties[key].copy(Project, model)
		}

		if (Project.overrides) {
			model.overrides = Project.overrides
		}
		model.resolution = {
			width: Project.texture_width || 16,
			height: Project.texture_height || 16,
		}

		if (options.flag) {
			model.flag = options.flag
		}

		if (options.editor_state) {
			Project.saveEditorState()
			model.editor_state = {
				save_path: Project.save_path,
				export_path: Project.export_path,
				saved: Project.saved,
				added_models: Project.added_models,
				mode: Project.mode,
				tool: Project.tool,
				display_uv: Project.display_uv,
				exploded_view: Project.exploded_view,
				uv_viewport: Project.uv_viewport,
				previews: JSON.parse(JSON.stringify(Project.previews)),

				selected_elements: Project.selected_elements.map(e => e.uuid),
				selected_group: Project.selected_group?.uuid,
				mesh_selection: JSON.parse(JSON.stringify(Project.mesh_selection)),
				selected_faces: Project.selected_faces,
				selected_texture: Project.selected_texture?.uuid,
			}
		}

		model.elements = []
		elements.forEach(el => {
			var obj = el.getSaveCopy!(model.meta)
			model.elements.push(obj)
		})
		model.outliner = compileGroups(true)

		model.textures = []
		Texture.all.forEach(tex => {
			var t = tex.getUndoCopy()
			delete t.selected
			if (isApp && Project.save_path && tex.path) {
				let relative = pathjs.relative(Project.save_path, tex.path)
				t.relative_path = relative.replace(/\\/g, '/')
			}
			if (
				options.bitmaps != false &&
				(Settings.get('embed_textures') || options.backup || options.bitmaps == true)
			) {
				t.source = 'data:image/png;base64,' + tex.getBase64()
				t.mode = 'bitmap'
			}
			if (options.absolute_paths == false) delete t.path
			model.textures.push(t)
		})

		if (Blockbench.Animation.all.length) {
			model.animations = []
			Blockbench.Animation.all.forEach(a => {
				model.animations.push(
					a.getUndoCopy!(
						{ bone_names: true, absolute_paths: options.absolute_paths },
						true
					)
				)
			})
		}
		if (AnimationController.all.length) {
			model.animation_controllers = []
			AnimationController.all.forEach(a => {
				model.animation_controllers.push(a.getUndoCopy!())
			})
		}
		if (Interface.Panels.variable_placeholders.inside_vue._data.text) {
			model.animation_variable_placeholders =
				Interface.Panels.variable_placeholders.inside_vue._data.text
		}

		if (!options.backup) {
			// Backgrounds
			const backgrounds: any = {}

			for (const key in Project.backgrounds) {
				let scene = Project.backgrounds[key]
				if (scene.image) {
					backgrounds[key] = scene.getSaveCopy()
				}
			}
			if (Object.keys(backgrounds).length) {
				model.backgrounds = backgrounds
			}
		}

		if (options.history) {
			model.history = []
			Undo.history.forEach(h => {
				var e = {
					before: omitKeys(h.before, ['aspects']),
					post: omitKeys(h.post, ['aspects']),
					action: h.action,
					time: h.time,
				}
				model.history.push(e)
			})
			model.history_index = Undo.index
		}

		const content = compileJSON(model)
		ajCodec.dispatchEvent('compile', { model, options })

		if (selectedVariant) Project.animated_java_variants!.selectedVariant = selectedVariant

		return content
	}),

	export: consoleGroup('ajCodec:export', () => {
		console.log('Exporting Animated Java model...')
		Blockbench.export({
			resource_id: 'animated_java.export',
			type: 'json',
			extensions: [ajCodec.extension],
			content: ajCodec.compile(),
			custom_writer: (content, path) => {
				ajCodec.write(content, path)
			},
		})
	}),

	fileName() {
		return Project!.animated_java_settings!.project_namespace.value
	},
})

export const ajModelFormat = new Blockbench.ModelFormat({
	id: 'animated_java/ajmodel',
	icon: 'icon-armor_stand',
	name: 'Animated Java Model',
	description: 'The Animated Java model format.',
	category: 'minecraft',
	target: 'Minecraft: Java Edition',
	confidential: false,
	condition: () => true,
	show_on_start_screen: true,
	format_page: {
		content: [{ type: 'h3', text: tl('animated_java.format_page.h3') }],
	},
	onStart() {},
	codec: ajCodec,

	box_uv: false,
	optional_box_uv: true,
	single_texture: false,
	model_identifier: false,
	parent_model_id: false,
	vertex_color_ambient_occlusion: true,
	animated_textures: true,
	bone_rig: true,
	centered_grid: true,
	rotate_cubes: true,
	integer_size: false,
	meshes: false,
	texture_meshes: false,
	locators: true,
	rotation_limit: false,
	uv_rotation: true,
	java_face_properties: true,
	select_texture_for_particles: false,
	bone_binding_expression: true,
	animation_files: false,
	texture_folder: true,
	edit_mode: true,
	paint_mode: true,
	display_mode: false,
	animation_mode: true,
	pose_mode: false,

	// cube_size_limiter: {
	// },
})
ajCodec.format = ajModelFormat

const saveProjectAction = BarItems.save_project as Action
const oldSaveProjectFunction = saveProjectAction.click
new BlockbenchMod({
	id: 'animated_java:save_project',
	inject() {
		saveProjectAction.click = (event: Event) => {
			if (Project && Project.format === ajModelFormat) {
				ajCodec.write(ajCodec.compile(), Project.save_path)
			} else {
				oldSaveProjectFunction(event)
			}
		}
	},
	extract() {
		saveProjectAction.click = oldSaveProjectFunction
	},
})

const saveProjectAsAction = BarItems.save_project_as as Action
const oldSaveProjectAsFunction = saveProjectAsAction.click
new BlockbenchMod({
	id: 'animated_java:save_project_as',
	inject() {
		saveProjectAsAction.click = (event: Event) => {
			if (Project && Project.format === ajModelFormat) {
				ajCodec.export()
			} else {
				oldSaveProjectAsFunction(event)
			}
		}
	},
	extract() {
		saveProjectAsAction.click = oldSaveProjectAsFunction
	},
})

const exportOverAction = BarItems.export_over as Action
const oldExportOverFunction = exportOverAction.click
new BlockbenchMod({
	id: 'animated_java:export_over',
	inject() {
		exportOverAction.click = (event: Event) => {
			if (Project && Project.format === ajModelFormat) {
				if (Format) {
					saveTextures()
					if (Project.export_path) {
						ajCodec.write(ajCodec.compile(), Project.export_path)
					} else if (!Project.save_path) {
						ajCodec.export()
					}
				}
				if (Blockbench.Animation.all.length) {
					;(BarItems.save_all_animations as Action).trigger()
				}
			} else {
				oldExportOverFunction(event)
			}
		}
	},
	extract() {
		exportOverAction.click = oldExportOverFunction
	},
})

const originalSelectProject = ModelProject.prototype.select

new BlockbenchMod({
	id: 'animated_kava:events.preSelectProject',
	inject() {
		ModelProject.prototype.select = function (this: ModelProject) {
			if (Project !== this) events.preSelectProject.dispatch(this)
			return originalSelectProject.call(this)
		}
	},
	extract() {
		ModelProject.prototype.select = originalSelectProject
	},
})
