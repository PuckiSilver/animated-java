import * as aj from '../animatedJava'
import {
	CustomError,
	fixIndent,
	format,
	JsonText,
	safeFunctionName,
	translate,
} from '../util'

interface animationExporterSettings {
	modelTag: string
	rootTag: string
	allBonesTag: string
	individualBoneTag: string
	rootEntityType: string
	boneType: 'aecStack' | 'armorStand'
	internalScoreboardObjective: string
	idScoreboardObjective: string
	frameScoreboardObjective: string
	exportMode: 'datapack' | 'mcb'
	mcbFilePath: string | undefined
	dataPackFilePath: string | undefined
	markerArmorStands: boolean
}

interface MCBConfig {
	dev: boolean
	header: string
	internalScoreboard: string
	generatedDirectory: string
	rootNamespace?: string
	defaultNamespace?: string
	[index: string]: any
}

interface entityTypes {
	bone: string
	root: string
	boneRoot: string
	boneDisplay?: string
}

async function createMCFile(
	bones: aj.BoneObject,
	models: aj.ModelObject,
	animations: aj.Animations,
	settings: aj.Settings,
	variantModels: aj.VariantModels,
	variantTextureOverrides: aj.VariantTextureOverrides,
	variantTouchedModels: aj.variantTouchedModels
): Promise<string> {
	const ajSettings = settings.animatedJava
	const exporterSettings: animationExporterSettings =
		settings.animatedJava_exporter_animationExporter
	const projectName = safeFunctionName(ajSettings.projectName)

	const FILE: string[] = []

	const rootExeErrorJsonText = new JsonText([
		'',
		{ text: 'AJ', color: 'green' },
		{ text: ' ? ', color: 'light_purple' },
		{ text: 'Error ?', color: 'red' },
		'\n',
		{ text: 'functionName', color: 'blue' },
		' ',
		{ text: 'must be executed as ', color: 'gray' },
		{ text: `aj.${projectName}.root`, color: 'light_purple' },
	]).toString()

	const scoreboards = {
		id: exporterSettings.idScoreboardObjective,
		internal: exporterSettings.internalScoreboardObjective,
		frame: exporterSettings.frameScoreboardObjective,
	}

	const tags = {
		model: format(exporterSettings.modelTag, {
			modelName: projectName,
		}),
		root: format(exporterSettings.rootTag, {
			modelName: projectName,
		}),
		allBones: format(exporterSettings.allBonesTag, {
			modelName: projectName,
		}),
		individualBone: format(exporterSettings.individualBoneTag, {
			modelName: projectName,
		}),
	}

	const entityTypes: entityTypes = {
		bone: `#${projectName}:bone_entities`,
		root: 'minecraft:marker',
		boneRoot: 'minecraft:area_effect_cloud',
		boneDisplay: 'minecraft:armor_stand',
	}
	// switch (exporterSettings.boneType) {
	// 	case 'aecStack':
	// 		entity_types.bone_root = 'minecraft:area_effect_cloud'
	// 		entity_types.bone_display = 'minecraft:armor_stand'
	// 		break
	// 	default:
	// 		entity_types.bone_root = 'minecraft:armor_stand'
	// 		// entity_types.bone_display = undefined
	// 		break
	// }

	const CONFIG: MCBConfig = {
		dev: false,
		header: '#built using mc-build (https://github.com/mc-build/mc-build)\n#Code generated by Animated Java (https://animated-java.dev/)',
		internalScoreboard: scoreboards.internal,
		generatedDirectory: 'zzz',
	}

	FILE.push(`
		function install {
			${Object.entries(scoreboards)
				.map(([k, v]) => `scoreboard objectives add ${v}`)
				.join('\n')}
		}
	`)

	//? Bone Entity Type
	FILE.push(`
		entities bone_entities {
			${entityTypes.boneRoot}
			${entityTypes.boneDisplay}
		}
	`)

	FILE.push(`dir summon {`)



	// FILE.push(`
	// 	function ${variantName} {

	// 	}
	// `)

	FILE.push(`}`)


	return fixIndent(FILE)
}

async function animationExport(data: any) {
	const mcFile = await createMCFile(
		data.bones,
		data.models,
		data.animations,
		data.settings,
		data.variantModels,
		data.variantTextureOverrides,
		data.variantTouchedModels
	)

	if (!data.settings.animatedJava_exporter_animationExporter.mcbFilePath) {
		let d = new Dialog({
			title: translate(
				'animatedJava_exporter_animationExporter.popup.error.mcbFilePathNotDefined.title'
			),
			id: '',
			lines: translate(
				'animatedJava_exporter_animationExporter.popup.error.mcbFilePathNotDefined.body'
			)
				.split('\n')
				.map((line: string) => `<p>${line}</p>`),
			onConfirm() {
				d.hide()
			},
			onCancel() {
				d.hide()
			},
		}).show()
		throw new CustomError({ silent: true })
	}

	console.log('mcFile:', mcFile)
	Blockbench.writeFile(
		data.settings.animatedJava_exporter_animationExporter.mcbFilePath,
		{
			content: mcFile,
			custom_writer: null,
		}
	)

	Blockbench.showQuickMessage('Model Exported Successfully')
}

const Exporter = (AJ: any) => {
	AJ.settings.registerPluginSettings(
		'animatedJava_exporter_animationExporter',
		{
			rootEntityType: {
				type: 'text',
				default: 'minecraft:marker',
				populate() {
					return 'minecraft:marker'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			boneType: {
				type: 'select',
				default: 'aecStack',
				options: {
					aecStack:
						'animatedJava_exporter_animationExporter.setting.boneType.aecStack.name',
					armorStand:
						'animatedJava_exporter_animationExporter.setting.boneType.armorStand.name',
				},
				populate() {
					return 'area_effect_cloud'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			markerArmorStands: {
				type: 'checkbox',
				default: true,
				populate() {
					return true
				},
				isValid(value: any) {
					return typeof value === 'boolean'
				},
			},
			modelTag: {
				type: 'text',
				default: 'aj.%modelName',
				populate() {
					return 'aj.%modelName'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			rootTag: {
				type: 'text',
				default: 'aj.%modelName.root',
				populate() {
					return 'aj.%modelName.root'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			allBonesTag: {
				type: 'text',
				default: 'aj.%modelName.bone',
				populate() {
					return 'aj.%modelName.bone'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			individualBoneTag: {
				type: 'text',
				default: 'aj.%modelName.%boneName',
				populate() {
					return 'aj.%modelName.%boneName'
				},
				isValid(value: any) {
					return value != ''
				},
				isResetable: true,
			},
			internalScoreboardObjective: {
				type: 'text',
				default: 'aj.i',
				populate() {
					return 'aj.i'
				},
				isValid(value: any) {
					return value != ''
				},
			},
			idScoreboardObjective: {
				type: 'text',
				default: 'aj.id',
				populate() {
					return 'aj.id'
				},
				isValid(value: any) {
					return value != ''
				},
			},
			frameScoreboardObjective: {
				type: 'text',
				default: 'aj.frame',
				populate() {
					return 'aj.frame'
				},
				isValid(value: any) {
					return value != ''
				},
			},
			exportMode: {
				type: 'select',
				default: 'mcb',
				options: {
					vanilla:
						'animatedJava_exporter_animationExporter.setting.exportMode.vanilla.name',
					mcb: 'animatedJava_exporter_animationExporter.setting.exportMode.mcb.name',
				},
				populate() {
					return 'mcb'
				},
				isValid(value: any) {
					return value != ''
				},
			},
			mcbFilePath: {
				type: 'filepath',
				default: '',
				props: {
					dialogOpts: {
						// @ts-ignore
						defaultPath: Project.name + '.mc',
						promptToCreate: true,
						properties: ['openFile'],
					},
				},
				populate() {
					return ''
				},
				isValid(value: any) {
					return true
				},
				isVisible(settings: any) {
					return (
						settings.animatedJava_exporter_animationExporter
							.exportMode === 'mcb'
					)
				},
				dependencies: [
					'animatedJava_exporter_animationExporter.exportMode',
				],
			},
			dataPackPath: {
				type: 'filepath',
				default: '',
				props: {
					target: 'folder',
					dialogOpts: {
						promptToCreate: true,
						properties: ['openDirectory'],
					},
				},
				populate() {
					return ''
				},
				isValid(value: any) {
					return true
				},
				isVisible(settings: any) {
					return (
						settings.animatedJava_exporter_animationExporter
							.exportMode === 'vanilla'
					)
				},
				dependencies: [
					'animatedJava_exporter_animationExporter.exportMode',
				],
			},
		}
	)
	AJ.registerExportFunc('animationExporter', function () {
		AJ.build(
			(data: any) => {
				console.log('Input Data:', data)
				animationExport(data)
			},
			{
				generate_static_animation: true,
			}
		)
	})
}
if (Reflect.has(window, 'ANIMATED_JAVA')) {
	Exporter(window['ANIMATED_JAVA'])
} else {
	// there is absolutly shit we can do about this
	// @ts-ignore
	Blockbench.on('animated-java-ready', Exporter)
}
